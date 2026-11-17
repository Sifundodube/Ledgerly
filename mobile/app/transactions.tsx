import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppScreen, colors, DataState, formatCurrency } from "../src/components/AppScreen";
import { api, type Category, type Transaction } from "../src/lib/api";

type Filters = { from: string; to: string; category: string; search: string };

function validDateFilter(value: string): boolean { return !value || /^\d{4}-\d{2}-\d{2}$/.test(value); }

export default function TransactionsScreen() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(timeout);
  }, [search]);

  const dateError = Boolean((from && !validDateFilter(from)) || (to && !validDateFilter(to)) || (from && to && from > to));
  const filters: Filters = { from, to, category, search: debouncedSearch };
  const query = useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: 1,
    enabled: !dateError,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: "25" });
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.category) params.set("category", filters.category);
      if (filters.search) params.set("q", filters.search);
      return api.transactions(params);
    },
    getNextPageParam: (lastPage) => lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined,
  });
  const categoryQuery = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const updateCategory = useMutation({
    mutationFn: ({ row, categoryId }: { row: Transaction; categoryId: number | null }) =>
      api.request<Transaction>(`/api/transactions/${row.id}`, { method: "PATCH", body: { categoryId } }),
    onSuccess: async () => {
      setSelected(null);
      setEditError("");
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error) => setEditError(error instanceof Error ? error.message : "Could not update this category."),
  });

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const categories = categoryQuery.data ?? [];
  const retry = () => { void query.refetch(); void categoryQuery.refetch(); };

  return (
    <AppScreen title="Transactions" eyebrow="Your activity">
      <View style={screenStyles.filters}>
        <View style={screenStyles.searchBox}>
          <Feather name="search" size={16} color="#89938b" />
          <TextInput style={screenStyles.searchInput} value={search} onChangeText={setSearch} placeholder="Search merchants or notes" placeholderTextColor="#a2aaa4" returnKeyType="search" accessibilityLabel="Search transactions" />
          {search ? <Pressable onPress={() => setSearch("")} accessibilityLabel="Clear search"><Feather name="x-circle" size={16} color="#9aa39c" /></Pressable> : null}
        </View>
        <View style={screenStyles.dateRow}>
          <TextInput value={from} onChangeText={setFrom} placeholder="From · YYYY-MM-DD" placeholderTextColor="#9aa39c" style={[screenStyles.dateInput, dateError && screenStyles.invalid]} accessibilityLabel="Start date" />
          <TextInput value={to} onChangeText={setTo} placeholder="To · YYYY-MM-DD" placeholderTextColor="#9aa39c" style={[screenStyles.dateInput, dateError && screenStyles.invalid]} accessibilityLabel="End date" />
        </View>
        {dateError ? <Text style={screenStyles.filterError}>Enter valid dates in YYYY-MM-DD order.</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.chips}>
          {[{ id: "", name: "All categories" }, { id: "uncategorized", name: "Uncategorized" }, ...categories.map((item: Category) => ({ id: String(item.id), name: item.name }))].map((item) => {
            const active = category === item.id;
            return <Pressable key={item.id || "all"} onPress={() => setCategory(item.id)} style={[screenStyles.chip, active && screenStyles.chipSelected]}><Text style={[screenStyles.chipText, active && screenStyles.chipTextSelected]}>{item.name}</Text></Pressable>;
          })}
        </ScrollView>
      </View>

      {query.isPending || categoryQuery.isPending ? <DataState kind="loading" title="Loading transactions" detail="Gathering your recent activity." /> : null}
      {query.isError || categoryQuery.isError ? <View style={screenStyles.stateWrap}><DataState kind="error" title="We couldn't load your activity" detail="Check your connection and try again." /><Pressable onPress={retry} style={screenStyles.retry}><Text style={screenStyles.retryText}>Try again</Text></Pressable></View> : null}
      {!query.isPending && !query.isError && rows.length === 0 ? <DataState title="No transactions found" detail="Try a different search or date range, or import a bank CSV." /> : null}

      {rows.length > 0 ? <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={screenStyles.listContent}
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.green} />}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={<View style={screenStyles.listHeader}><Text style={screenStyles.sectionTitle}>Recent activity</Text><Text style={screenStyles.resultCount}>{query.data?.pages[0]?.total ?? rows.length} entries</Text></View>}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={screenStyles.more} color={colors.green} /> : <View style={screenStyles.bottomSpace} />}
        renderItem={({ item }) => <TransactionRow row={item} onEdit={() => { setEditError(""); setSelected(item); }} />}
      /> : null}

      <Modal transparent animationType="fade" visible={Boolean(selected)} onRequestClose={() => setSelected(null)}>
        <Pressable style={screenStyles.modalShade} onPress={() => setSelected(null)}>
          <Pressable style={screenStyles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={screenStyles.modalHeading}><View><Text style={screenStyles.modalEyebrow}>CHANGE CATEGORY</Text><Text style={screenStyles.modalTitle} numberOfLines={1}>{selected?.description}</Text></View><Pressable onPress={() => setSelected(null)} accessibilityLabel="Close"><Feather name="x" size={20} color={colors.muted} /></Pressable></View>
            <ScrollView style={screenStyles.optionList}>
              {[...categories, { id: -1, name: "Uncategorized", color: "#a5aea7", userId: null }].map((item) => (
                <Pressable key={item.id} disabled={updateCategory.isPending} onPress={() => selected && updateCategory.mutate({ row: selected, categoryId: item.id < 0 ? null : item.id })} style={screenStyles.option}>
                  <View style={[screenStyles.categoryDot, { backgroundColor: item.color }]} /><Text style={screenStyles.optionText}>{item.name}</Text>
                  {selected?.categoryName === item.name ? <Feather name="check" size={16} color={colors.green} /> : null}
                </Pressable>
              ))}
            </ScrollView>
            {updateCategory.isPending ? <ActivityIndicator color={colors.green} /> : null}
            {editError ? <Text style={screenStyles.filterError}>{editError}</Text> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

function TransactionRow({ row, onEdit }: { row: Transaction; onEdit: () => void }) {
  const expense = row.amount < 0;
  const date = new Date(`${row.date}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  return (
    <View style={screenStyles.row}>
      <View style={[screenStyles.merchantIcon, { backgroundColor: expense ? "#f6eee5" : colors.greenWash }]}><Feather name={expense ? "arrow-up-right" : "arrow-down-left"} size={16} color={expense ? "#ad7949" : colors.green} /></View>
      <View style={screenStyles.rowMain}>
        <Text style={screenStyles.merchant} numberOfLines={1}>{row.description}</Text>
        <View style={screenStyles.rowMeta}><Text style={screenStyles.date}>{date}</Text><Text style={screenStyles.bullet}>·</Text><Pressable onPress={onEdit} style={screenStyles.categoryTag}><View style={[screenStyles.categoryDotSmall, { backgroundColor: row.categoryColor ?? "#a5aea7" }]} /><Text style={screenStyles.categoryName} numberOfLines={1}>{row.categoryName ?? "Uncategorized"}</Text><Feather name="chevron-down" size={12} color="#9ba59e" /></Pressable></View>
      </View>
      <Text style={[screenStyles.amount, !expense && screenStyles.income]}>{expense ? "−" : "+"}{formatCurrency(Math.abs(row.amount))}</Text>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  filters: { paddingHorizontal: 17, paddingTop: 13, paddingBottom: 8, backgroundColor: colors.canvas },
  searchBox: { height: 43, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  searchInput: { flex: 1, color: colors.ink, fontSize: 12, paddingVertical: 0 },
  dateRow: { flexDirection: "row", gap: 8, marginTop: 9 },
  dateInput: { flex: 1, height: 37, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.paper, paddingHorizontal: 10, color: colors.ink, fontSize: 10 },
  invalid: { borderColor: "#d5746b" }, filterError: { color: colors.red, fontSize: 10, marginTop: 6 },
  chips: { gap: 7, paddingVertical: 11, paddingRight: 18 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  chipSelected: { backgroundColor: colors.greenWash, borderColor: "#c9ddce" }, chipText: { color: colors.muted, fontSize: 10, fontWeight: "600" }, chipTextSelected: { color: colors.green },
  listContent: { paddingHorizontal: 17, paddingBottom: 12 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 9 },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" }, resultCount: { color: colors.muted, fontSize: 10 },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line, gap: 10 },
  merchantIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowMain: { flex: 1, minWidth: 0 }, merchant: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }, date: { color: "#929d95", fontSize: 9 }, bullet: { color: "#c1c8c2", fontSize: 10 },
  categoryTag: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 }, categoryDot: { width: 8, height: 8, borderRadius: 4 }, categoryDotSmall: { width: 6, height: 6, borderRadius: 3 },
  categoryName: { color: colors.muted, fontSize: 9, maxWidth: 100 }, amount: { color: colors.ink, fontSize: 11, fontWeight: "700", marginLeft: 5 }, income: { color: colors.green },
  more: { paddingVertical: 16 }, bottomSpace: { height: 20 }, stateWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  retry: { backgroundColor: colors.greenWash, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10 }, retryText: { color: colors.green, fontSize: 12, fontWeight: "700" },
  modalShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,32,24,0.34)", paddingHorizontal: 12, paddingBottom: 16 },
  modalCard: { maxHeight: "72%", backgroundColor: colors.paper, borderRadius: 22, padding: 19 }, modalHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 15, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalEyebrow: { color: colors.green, fontSize: 9, fontWeight: "700", letterSpacing: 1 }, modalTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", marginTop: 5, maxWidth: 280 },
  optionList: { marginTop: 6 }, option: { minHeight: 45, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "#f0f2ef" },
  optionText: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "500" },
});
