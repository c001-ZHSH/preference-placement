import streamlit as st
import pandas as pd
import networkx as nx
from solver import DistributionSolver
import io

st.set_page_config(page_title="大學參訪分發系統", layout="wide")

st.title("🎓 大學參訪報名分發系統")
st.markdown("""
本系統協助您將學生分配至參訪路線，並透過演算法最大化錄取人數。
""")

# --- Step 1: Data Loading ---
st.sidebar.header("1. 資料匯入")
data_source = st.sidebar.radio("選擇資料來源", ["上傳檔案 (CSV/Excel)", "Google Sheet ID"])

df = None
excel_file = None # Keep reference for later if needed (e.g. mapping)

if data_source == "上傳檔案 (CSV/Excel)":
    uploaded_file = st.sidebar.file_uploader("上傳報名表", type=["csv", "xlsx"])
    if uploaded_file:
        try:
            if uploaded_file.name.endswith('.csv'):
                df = pd.read_csv(uploaded_file)
            else:
                excel_file = pd.ExcelFile(uploaded_file)
                sheet_names = excel_file.sheet_names
                if len(sheet_names) > 1:
                    sheet = st.sidebar.selectbox("選擇報名表資料所在的工作表", sheet_names)
                    df = pd.read_excel(excel_file, sheet_name=sheet)
                else:
                    df = pd.read_excel(excel_file)
            
            st.sidebar.success(f"成功載入 {len(df)} 筆資料")
        except Exception as e:
            st.sidebar.error(f"讀取錯誤: {e}")

else:
    sheet_id = st.sidebar.text_input("輸入 Google Sheet ID")
    st.sidebar.info("請確保試算表權限設為「知道連結者可檢視」或已發布到網路。")
    if sheet_id:
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
        try:
            df = pd.read_csv(url)
            st.sidebar.success(f"成功載入 {len(df)} 筆資料")
        except Exception as e:
            st.sidebar.error(f"無法讀取 Google Sheet (請確認 ID 與權限): {e}")

# Preference Mode Selection
st.sidebar.divider()
st.sidebar.header("分發邏輯設定")
preference_mode = st.sidebar.radio(
    "志願權重模式",
    ["志願序優先 (1>2>3...)", "不分志願序 (權重相同)"],
    help="「志願序優先」：系統會盡量滿足學生的第1志願，其次第2...。\n「不分志願序」：只要學生有填，錄取任何一個志願對系統來說分數都一樣。"
)
use_priority = (preference_mode == "志願序優先 (1>2>3...)")

# --- Step 2: Column Config ---
if df is not None:
    st.divider()
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("設定欄位")
        all_cols = df.columns.tolist()
        # Guess ID column
        default_id = next((c for c in all_cols if "學號" in c or "名" in c or "ID" in c), all_cols[0])
        id_col = st.selectbox("選擇「學號/姓名」欄位", all_cols, index=all_cols.index(default_id))
        
        # Guess Choice columns
        default_choices = [c for c in all_cols if "志願" in c or "意願" in c or "選擇" in c or "路線" in c]
        choice_cols = st.multiselect("選擇「路線/志願」欄位 (可多選 1~5)", all_cols, default=default_choices)

    if not choice_cols:
        st.warning("請至少選擇一個志願欄位")
        st.stop()

    # --- Main Layout: Two Columns ---
    st.divider()
    left_col, right_col = st.columns([1, 1.5], gap="large") # 40% Left, 60% Right

    with left_col:
        st.subheader("🛠️ 設定與分析")
        
        # --- Step 2.5: Route Merging (Optional) ---
        with st.expander("🔗 路線合併 (將多個學類整合成一條路線)", expanded=False):
            st.write("您可以將性質相近的路線合併 (例如: 「數理皆有」 = 「數學」+「物理」)。")
    
            # Initialize merge map
            if "merge_map" not in st.session_state:
                st.session_state["merge_map"] = {}
            
            # Display current merges
            if st.session_state["merge_map"]:
                st.write("📝 目前的合併設定：")
                # Group by target
                merges_view = {}
                for original, target in st.session_state["merge_map"].items():
                    if target not in merges_view:
                        merges_view[target] = []
                    merges_view[target].append(original)
                
                for target, originals in merges_view.items():
                    c1, c2 = st.columns([4, 1])
                    c1.info(f"「{target}」 ⬅️ {', '.join(originals)}")
                    if c2.button("刪除", key=f"del_{target}"):
                        # Remove all keys pointing to this target
                        keys_to_del = [k for k, v in st.session_state["merge_map"].items() if v == target]
                        for k in keys_to_del:
                            del st.session_state["merge_map"][k]
                        
                        # Force refresh of route config
                        if "route_config" in st.session_state:
                            del st.session_state["route_config"]
                            
                        st.rerun()
            
            # Merge input
            # Get raw unique routes first
            raw_routes = set()
            for col in choice_cols:
                 vals = df[col].dropna().astype(str).unique()
                 for v in vals:
                     if v.strip():
                         raw_routes.add(v.strip())
            
            # Exclude those already merged? No, allow re-merge.
            # But source list should probably exclude those already mapped?
            # Or just show all.
            available_sources = sorted(list(raw_routes))
            
            if st.session_state["merge_map"]:
                # Count distinct target names
                targets = set(st.session_state["merge_map"].values())
                st.info(f"💡 目前已設定 **{len(targets)}** 組合併規則。您可以繼續新增更多組。")
    
            # Merge input form
            with st.form("merge_form", clear_on_submit=True):
                st.write("🔧 **新增合併規則** (可多次新增，例如先合併 A+B，再合併 C+D)")
                c1, c2 = st.columns(2)
                sources = c1.multiselect("選擇要合併的原始路線", available_sources)
                new_name = c2.text_input("輸入合併後的新名稱")
                submitted = st.form_submit_button("➕ 新增合併並清除輸入")
                
                if submitted:
                    if sources and new_name:
                        for s in sources:
                            st.session_state["merge_map"][s] = new_name
                        
                        # Force refresh of route config to show new combined route
                        if "route_config" in st.session_state:
                             del st.session_state["route_config"]
                             
                        st.success(f"已將 {len(sources)} 條路線合併為「{new_name}」")
                        st.rerun()
                    else:
                        st.warning("請選擇路線並輸入名稱")
    
            if st.button("🗑️ 清除所有合併設定"):
                 st.session_state["merge_map"] = {}
                 if "route_config" in st.session_state:
                     del st.session_state["route_config"]
                 st.rerun()
                 
            # Batch Import
            st.markdown("---")
            st.write("📂 **批次匯入對照表** (自動將學類歸類至學群)")
            if excel_file:
                 st.info("💡 檢測到您已上傳 Excel 檔案，可直接從中選擇工作表進行匯入。")
                 use_existing_excel = st.checkbox("從目前的 Excel 檔案匯入對照表", value=True)
            else:
                 use_existing_excel = False
    
            if use_existing_excel and excel_file:
                 # Use existing file
                 map_sheet = st.selectbox("選擇對照表所在的工作表", excel_file.sheet_names, key="map_sheet_selector")
                 if st.button("📥 從選定工作表匯入"):
                     try:
                         map_df = pd.read_excel(excel_file, sheet_name=map_sheet)
                         # Same logic as below... extract to function ideally, but inline for now
                         cols = map_df.columns.tolist()
                         key_col = next((c for c in cols if "學類" in c or "系" in c or "Subject" in c), None)
                         val_col = next((c for c in cols if "學群" in c or "Cluster" in c), None)
                         
                         if key_col and val_col:
                            added_count = 0
                            for _, row in map_df.iterrows():
                                k = str(row[key_col]).strip()
                                v = str(row[val_col]).strip()
                                if k and v and v.lower() != "nan":
                                    st.session_state["merge_map"][k] = v
                                    added_count += 1
                            
                            # Force refresh
                            if "route_config" in st.session_state:
                                del st.session_state["route_config"]
                                
                            st.success(f"已成功匯入 {added_count} 筆對照資料！")
                            st.rerun()
                         else:
                            st.error("無法視別欄位，請確認檔案包含「學類」與「學群」相關名稱的欄位。")
                     except Exception as e:
                         st.error(f"讀取錯誤: {e}")
            
            else:
                merge_file = st.file_uploader("上傳學類學群對照表 (CSV/Excel, 需包含「學類」與「學群」欄位)", type=["csv", "xlsx"])
                if merge_file:
                    try:
                        if merge_file.name.endswith('.csv'):
                            map_df = pd.read_csv(merge_file)
                        else:
                            map_df = pd.read_excel(merge_file)
                    
                        # Try to identify columns
                        cols = map_df.columns.tolist()
                        key_col = next((c for c in cols if "學類" in c or "系" in c or "Subject" in c), None)
                        val_col = next((c for c in cols if "學群" in c or "Cluster" in c), None)
                        
                        if key_col and val_col:
                            if st.button(f"📥 確認匯入 (將依據「{val_col}」欄位進行合併)"):
                                added_count = 0
                                for _, row in map_df.iterrows():
                                    k = str(row[key_col]).strip()
                                    v = str(row[val_col]).strip()
                                    if k and v and v.lower() != "nan":
                                        st.session_state["merge_map"][k] = v
                                        added_count += 1
                                
                                # Force refresh
                                if "route_config" in st.session_state:
                                    del st.session_state["route_config"]
                                    
                                st.success(f"已成功匯入 {added_count} 筆對照資料！")
                                st.rerun()
                        else:
                            st.error("無法視別欄位，請確認檔案包含「學類」與「學群」相關名稱的欄位。")
                            st.dataframe(map_df.head())
                    except Exception as e:
                        st.error(f"讀取失敗: {e}")

    # Apply Merges to a working copy of DF
    working_df = df.copy()
    if st.session_state.get("merge_map"):
        # Apply transformation to all choice columns
        # Replace values based on map
        for col in choice_cols:
            working_df[col] = working_df[col].astype(str).str.strip().replace(st.session_state["merge_map"])

    # --- Step 3: Route Selection & Capacity ---
    # st.divider() # Removed divider as we are in columns now? No, keep logic clean
    
    # 1. Frequency Analysis (Using working_df)
    route_counts = {}
    first_choice_counts = {}
    
    for i, col in enumerate(choice_cols):
        counts = working_df[col].value_counts()
        for route, count in counts.items():
            route_str = str(route).strip()
            if route_str and route_str != "nan": # Filter nan strings if any
                route_counts[route_str] = route_counts.get(route_str, 0) + count
                # Track First Choice (i=0)
                if i == 0:
                    first_choice_counts[route_str] = first_choice_counts.get(route_str, 0) + count
    
    with left_col:
        # --- Smart Recommendation ---
        with st.expander("🤖 智慧推薦 (選最好)", expanded=False):
            st.write("系統可以幫您計算：挑選哪幾條路線能讓「最多學生有學校去」。")
            k_routes = st.slider("想要開設幾條路線？", 1, len(route_counts), 9)
            rec_capacity = st.number_input("各路線預設名額", value=35, min_value=1)
            
            if st.button("✨ 自動挑選最佳組合"):
                with st.spinner("正在計算最佳覆蓋率..."):
                    # Algorithm: Greedy Set Cover with Capacity
                    # 1. Map Route -> Set of Students (IDs)
                    route_to_students = {}
                    all_student_ids = set()
                    
                    # Build mapping
                    for idx, row in working_df.iterrows():
                        sid = f"S_{idx}" # Internal ID
                        all_student_ids.add(sid)
                        
                        # Get student choices
                        seen = set()
                        for col in choice_cols:
                            val = row[col]
                            if pd.notna(val):
                                r = str(val).strip()
                                if r and r in route_counts and r not in seen:
                                    if r not in route_to_students:
                                        route_to_students[r] = set()
                                    route_to_students[r].add(sid)
                                    seen.add(r)
                    
                    # Greedy Loop
                    selected_routes = set()
                    unmatched_students = all_student_ids.copy()
                    
                    for _ in range(k_routes):
                        best_route = None
                        best_gain = -1
                        
                        # Evaluate candidates
                        candidates = [r for r in route_to_students if r not in selected_routes]
                        for r in candidates:
                            # How many unmatched students want this route?
                            interested_unmatched = 0
                            for sid in route_to_students[r]:
                                if sid in unmatched_students:
                                    interested_unmatched += 1
                            
                            gain = min(interested_unmatched, rec_capacity)
                            
                            if gain > best_gain:
                                best_gain = gain
                                best_route = r
                                
                        if best_route and best_gain > 0:
                            selected_routes.add(best_route)
                            interested_list = [sid for sid in route_to_students[best_route] if sid in unmatched_students]
                            covered = interested_list[:int(rec_capacity)]
                            for sid in covered:
                                unmatched_students.remove(sid)
                        else:
                            break 
                            
                    # Apply selection
                    if selected_routes:
                        current_df = st.session_state["route_config"].copy()
                        current_df["啟用"] = current_df["路線名稱"].isin(selected_routes)
                        
                        for i in current_df.index:
                            if current_df.at[i, "啟用"]:
                                current_df.at[i, "名額上限"] = rec_capacity
                        
                        st.session_state["route_config"] = current_df
                        st.success(f"已自動挑選 {len(selected_routes)} 條最佳路線！(預估能多錄取 {len(all_student_ids) - len(unmatched_students)} 人)")
                        st.rerun()
                    else:
                        st.warning("無法找到合適的其餘路線。")
    
        # --- Overlap Analysis ---
        with st.expander("📊 志願重疊性分析 (檢視路線替代性)", expanded=False):
            st.write("此功能協助您判斷：某條路線的需求，是否與其他熱門路線高度重疊？(如果重疊高，且熱門路線有名額，這條路線實際報到率可能較低)")
            
            # Ensure route_counts is available
            if "route_counts" in locals() and route_counts:
                target_route_overlap = st.selectbox("選擇要分析的目標路線", list(route_counts.keys()))
                
                if target_route_overlap:
                    # 1. Identify students who chose this route
                    target_students = set()
                    student_choices_map = {} # sid -> set of choices
                    
                    for idx, row in working_df.iterrows():
                        sid = f"S_{idx}"
                        choices = set()
                        has_target = False
                        for col in choice_cols:
                            val = row[col]
                            if pd.notna(val):
                                r = str(val).strip()
                                if r:
                                    choices.add(r)
                                    if r == target_route_overlap:
                                        has_target = True
                        
                        if has_target:
                            target_students.add(sid)
                            student_choices_map[sid] = choices
                    
                    total_target_applicants = len(target_students)
                    st.metric(f"「{target_route_overlap}」總意願人數", total_target_applicants)
                    
                    if total_target_applicants > 0:
                        # 2. Analyze co-occurrence
                        co_counts = {}
                        for sid in target_students:
                            for other_r in student_choices_map[sid]:
                                if other_r != target_route_overlap:
                                    co_counts[other_r] = co_counts.get(other_r, 0) + 1
                        
                        # Convert to DF
                        co_data = []
                        for r, count in co_counts.items():
                            co_data.append({
                                "重疊路線": r,
                                "重疊人數": count,
                                "重疊比例": count / total_target_applicants
                            })
                        
                        if co_data:
                            co_df = pd.DataFrame(co_data).sort_values("重疊人數", ascending=False)
                            
                            st.write(f"會選「{target_route_overlap}」的學生，同時也選了：")
                            st.dataframe(
                                co_df.style.format({"重疊比例": "{:.1%}"}),
                                use_container_width=True
                            )
                            
                            # Insight
                            top_overlap = co_df.iloc[0]
                            st.info(f"💡 分析：選這條路線的學生，有 **{top_overlap['重疊比例']:.1%}** 的人也選了 **「{top_overlap['重疊路線']}」**。")
                        else:
                            st.info("選這條路線的學生沒有選擇其他路線 (皆為唯一志願)。")
                    else:
                        st.warning("此路線無人選擇。")
            else:
                st.warning("尚未產生路線數據，請先檢查資料欄位設定。")

    # --- Right Column: Route Selection & Capacity ---
    with right_col:
        st.subheader("📋 路線列表與分發")
        # st.info("💡 路線已依熱門度排序。請勾選您要安排的路線，並輸入名額上限 (空白將視為 0)。")
        
        # Initialize Session State for route configuration if new data loaded or first run
        # Key concept: We only want to rebuild the list if the source data seems "new" or user requests reset.
        # We can use a hash of route_counts or just check if 'route_config' exists.
        
        # Check if we need to initialize/reset
        # We use a state key 'last_choice_cols' to detect if column selection changed.
        choices_key = str(sorted(choice_cols))
        
        if "route_config" not in st.session_state or st.session_state.get("last_choice_cols") != choices_key:
            # Create initial DF sorted by votes
            route_data = []
            for r, count in route_counts.items():
                first_n = first_choice_counts.get(r, 0)
                route_data.append({
                    "路線名稱": r,
                    "熱門度 (總人次)": count,
                    "第一志願 (人數)": first_n, # New Metric
                    "備選人次": count - first_n, # Derived metric
                    "啟用": False, # Default to False as per user request ("I can select...")
                    "名額上限": None # Default to None (Blank) as per user request
                })
            
            init_df = pd.DataFrame(route_data)
            init_df = init_df.sort_values("第一志願 (人數)", ascending=False) # Sort by First Choice? Or Total? Maybe First Choice is more useful now.
            st.session_state["route_config"] = init_df
            st.session_state["last_choice_cols"] = choices_key
    
        # Button to reset config based on current data
        if st.button("🔄 重置路線列表"):
             route_data = []
             for r, count in route_counts.items():
                first_n = first_choice_counts.get(r, 0)
                route_data.append({
                    "路線名稱": r,
                    "熱門度 (總人次)": count,
                    "第一志願 (人數)": first_n,
                    "備選人次": count - first_n,
                    "啟用": False, 
                    "名額上限": None
                })
             init_df = pd.DataFrame(route_data).sort_values("第一志願 (人數)", ascending=False)
             st.session_state["route_config"] = init_df
             st.rerun()

    # Use the session state dataframe for the editor
    # FIX: We use st.session_state to store the DataFrame.
    # We do NOT use the 'key' parameter for data_editor if we are manually managing the synchronization,
    # OR we use the 'key' and access the value from session_state.
    # Best practice for persistence:
    # 1. Initialize session_state['df'] (Done above)
    # 2. Assign result of data_editor back to session_state['df']
    # 3. Use 'key' to let Streamlit maintain widget state? No, that causes conflict if we try to modify it programmatically (e.g. Reset button).
    # Solution: We drop the 'key' argument and just use the return value to update our persistent variable.
    # This prevents the "Widget on_change" vs "Manual update" race condition.
    
    with right_col:
        edited_routes = st.data_editor(
            st.session_state["route_config"], 
            column_config={
                "路線名稱": st.column_config.TextColumn("路線名稱", disabled=True),
                "熱門度 (總人次)": st.column_config.NumberColumn("熱門總計", disabled=True, format="%d", help="所有志願中出現的總次數"),
                "第一志願 (人數)": st.column_config.ProgressColumn("第一志願", min_value=0, max_value=len(working_df), format="%d", help="將此路線填在第1志願的人數 (最核心的需求)"),
                "備選人次": st.column_config.NumberColumn("備選人次", disabled=True, format="%d", help="填在第2志願以後的人次"),
                "啟用": st.column_config.CheckboxColumn("啟用? (勾選以排入)", default=False),
                "名額上限": st.column_config.NumberColumn("名額上限", min_value=0, max_value=1000, step=1, required=False)
            },
            hide_index=True,
            use_container_width=True,
            height=600  # Explicit height to reduce scrolling in right column
            # Removed key="editor_routes" to fix state conflict
        )
        
        # Update persistent state with current edits
        st.session_state["route_config"] = edited_routes
    
    with right_col:
        # Filter for active routes
        active_routes = edited_routes[edited_routes["啟用"] == True]
        
        # Convert active routes to capacities dict
        # Handle None/NaN -> 0
        capacities = {}
        for _, row in active_routes.iterrows():
            cap = row["名額上限"]
            if pd.isna(cap) or cap == "":
                cap = 0
            capacities[row["路線名稱"]] = int(cap)
        
        if not capacities:
            st.warning("⚠️ 請至少勾選並啟用一條路線才能進行分發！")
            st.stop()
        
        st.write(f"共啟用 {len(capacities)} 條路線，總名額: {sum(capacities.values())}")
        
        # --- Pre-run Check: Coverage Analysis ---
        # Check if any student has NO choices in the active routes
        # This means they are guaranteed to fail even before running solver
        with st.expander("🔍 預先檢查：完全沒選到啟用路線的學生", expanded=False):
            active_route_set = set(capacities.keys())
            totally_uncovered_students = []
            
            for idx, row in working_df.iterrows():
                has_chance = False
                for col in choice_cols:
                    val = row[col]
                    if pd.notna(val):
                        r = str(val).strip()
                        if r in active_route_set:
                            has_chance = True
                            break
                if not has_chance:
                    totally_uncovered_students.append(row[id_col])
            
            if totally_uncovered_students:
                st.error(f"⚠️ 警告：有 **{len(totally_uncovered_students)}** 位學生的所有志願都不在您勾選的路線中。(這些學生註定無法錄取)")
                st.write("名單：", ", ".join(map(str, totally_uncovered_students)))
            else:
                st.success("✅ 所有學生至少都有填寫一個您已勾選啟用的路線。")
        st.divider()
        if st.button("🚀 開始分發", type="primary", use_container_width=True):
            with st.spinner("正在計算最佳分配..."):
                # Use working_df which has merged routes
                solver = DistributionSolver(working_df, id_col, choice_cols, capacities, use_priority=use_priority)
                results, unmatched, stats = solver.solve()
                
                # Store results in session state
                st.session_state["solver_results"] = {
                    "results": results,
                    "unmatched": unmatched,
                    "stats": stats,
                    "solver": solver,
                    "capacities": capacities
                }
        
        # Display Results if available
        if "solver_results" in st.session_state:
            res_data = st.session_state["solver_results"]
            stats = res_data["stats"]
            results = res_data["results"]
            unmatched = res_data["unmatched"]
            solver = res_data["solver"]
            # specific_capacities = res_data["capacities"] # Not strictly needed if we just use current, but consistency is good.
            
            # Metrics
            m1, m2, m3 = st.columns(3)
            m1.metric("總報名人數", stats["total_students"])
            m2.metric("成功錄取人數", stats["total_matched"], delta=f"{stats['match_rate']:.1%}")
            m3.metric("未錄取人數", stats["total_unmatched"], delta_color="inverse")
            
            # Charts
            st.subheader("📊 分發狀況")
            
            # Route Usage Chart
            usage = solver.get_route_usage()
            usage_df = pd.DataFrame([
                {"路線": r, "已用名額": u, "總名額": capacities.get(r, 0)} 
                for r, u in usage.items()
            ])
            usage_df["使用率"] = usage_df["已用名額"] / usage_df["總名額"].replace(0, 1)
            
            st.bar_chart(usage_df.set_index("路線")[["已用名額", "總名額"]])

            # Added: Table for detailed usage stats
            with st.expander("查看各路線詳細錄取人數", expanded=True):
                st.dataframe(
                    usage_df[["路線", "已用名額", "總名額", "使用率"]].style.format({
                        "已用名額": "{:.0f}",
                        "總名額": "{:.0f}",
                        "使用率": "{:.1%}"
                    }),
                    use_container_width=True
                )
            
            # Results Table
            tab1, tab2 = st.tabs(["錄取名單", "未錄取名單"])
            
            with tab1:
                st.dataframe(results, use_container_width=True)
                csv = results.to_csv(index=False).encode('utf-8-sig') # utf-8-sig for Excel
                st.download_button("下載錄取名單 (CSV)", csv, "matched_results.csv", "text/csv")
                
            with tab2:
                if unmatched:
                    # Find indices of unmatched students
                    unmatched_mask = working_df[id_col].isin(unmatched)
                    cols_to_show = [id_col] + choice_cols
                    unmatched_df = working_df.loc[unmatched_mask, cols_to_show].copy()
                    
                    st.dataframe(unmatched_df, use_container_width=True)
                    csv_un = unmatched_df.to_csv(index=False).encode('utf-8-sig')
                    st.download_button("下載未錄取名單 (CSV)", csv_un, "unmatched.csv", "text/csv")
                else:
                    st.success("恭喜！所有學生皆已錄取！")

else:
    st.info("👈 請先在左側匯入資料")
