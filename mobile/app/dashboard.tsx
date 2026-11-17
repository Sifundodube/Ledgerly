import { useMemo } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LineChart, PieChart } from "react-native-chart-kit";
import { AppScreen, colors, DataState, formatCurrency } from "../src/components/AppScreen";
import { api } from "../src/lib/api";

const monthNow = (): string => new Date().toISOString().slice(0, 7);
const monthEnd = (month: string): string => {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`;
};
const monthStart = (month: string): string => `${month}-01`;
const shortMonth = (month: string): string => new Date(`${month}-01T12:00:00`).toLocaleDateString("en-ZA", { month: "short" });

const chartConfig = {
  backgroundGradientFrom: colors.paper,
  backgroundGradientTo: colors.paper,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(39, 107, 82, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(119, 129, 122, ${opacity})`,
  propsForDots: { r: "3", strokeWidth: "2", stroke: colors.green },
  propsForBackgroundLines: { stroke: "#edf0ed", strokeDasharray: "4, 7" },
  fillShadowGradientFrom: "#c5ddce",
  fillShadowGradientTo: "#ffffff",
  fillShadowGradientOpacity: 0.35,
};

export default function DashboardScreen() {
  const { width: viewportWidth } = useWindowDimensions();
  const month = monthNow();
  const summary = useQuery({ queryKey: ["summary", month], queryFn: () => api.summary(month) });
  const categories = useQuery({ queryKey: ["byCategory", month], queryFn: () => api.byCategory(monthStart(month), monthEnd(month)) });
  const trend = useQuery({ queryKey: ["trend", 6], queryFn: () => api.trend(6) });
  const forecastCategory = categories.data?.find((item) => item.expense > 0)?.category ?? "";
  const forecast = useQuery({ queryKey: ["forecast", forecastCategory], queryFn: () => api.forecast(forecastCategory), enabled: Boolean(forecastCategory) });
  const chartWidth = Math.max(225, Math.min(viewportWidth - 44, 700));
  const chartCategories = useMemo(() => categories.data?.filter((item) => item.expense > 0).slice(0, 6).map((item) => ({
    name: item.category, population: item.expense, color: item.color, legendFontColor: colors.muted, legendFontSize: 10,
  })) ?? [], [categories.data]);
  const loading = summary.isPending || categories.isPending || trend.isPending;
  const failed = summary.isError || categories.isError || trend.isError || (forecastCategory && forecast.isError);
  const refresh = () => { void Promise.all([summary.refetch(), categories.refetch(), trend.refetch(), forecast.refetch()]); };

  return (
    <AppScreen title="Your money, clearly." eyebrow={new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}>
      {loading ? <DataState kind="loading" title="Preparing your overview" detail="Adding up the latest numbers." /> : null}
      {failed ? <View style={dashboardStyles.stateArea}><DataState kind="error" title="Your overview didn't load" detail="Check your connection and try again." /><Pressable onPress={refresh} style={dashboardStyles.retry}><Text style={dashboardStyles.retryText}>Try again</Text></Pressable></View> : null}
      {!loading && !failed && summary.data ? <ScrollView
        contentContainerStyle={dashboardStyles.content}
        refreshControl={<RefreshControl refreshing={summary.isRefetching || categories.isRefetching || trend.isRefetching} onRefresh={refresh} tintColor={colors.green} />}
      >
        <View style={dashboardStyles.welcome}><View><Text style={dashboardStyles.welcomeTitle}>A little more clarity.</Text><Text style={dashboardStyles.welcomeText}>Here's how this month is shaping up.</Text></View><View style={dashboardStyles.sparkle}><Feather name="sun" size={17} color={colors.green} /></View></View>
        <View style={dashboardStyles.summaryGrid}>
          <SummaryCard label="INCOME" value={summary.data.income} icon="arrow-down-left" tint="#e8f1eb" color={colors.green} />
          <SummaryCard label="SPENT" value={summary.data.expense} icon="arrow-up-right" tint="#f8eee7" color="#b5794b" />
          <SummaryCard label="NET THIS MONTH" value={summary.data.net} icon="activity" tint="#edf0f7" color="#647999" />
          <View style={dashboardStyles.summaryCard}><Text style={dashboardStyles.cardEyebrow}>TRANSACTIONS</Text><Text style={dashboardStyles.summaryCount}>{summary.data.transactionCount}</Text><Text style={dashboardStyles.cardHint}>this month</Text></View>
        </View>

        <View style={dashboardStyles.panel}>
          <View style={dashboardStyles.panelHeading}><View><Text style={dashboardStyles.panelTitle}>Where it goes</Text><Text style={dashboardStyles.panelSubtitle}>Spending by category this month</Text></View><Feather name="pie-chart" size={17} color={colors.green} /></View>
          {chartCategories.length ? <PieChart data={chartCategories} width={chartWidth} height={190} accessor="population" backgroundColor="transparent" paddingLeft="12" hasLegend={false} chartConfig={chartConfig} /> : <DataState title="No spending to chart yet" detail="Your categories will appear here as transactions come in." />}
          {chartCategories.length ? <View style={dashboardStyles.legend}>{chartCategories.map((item) => <View key={item.name} style={dashboardStyles.legendItem}><View style={[dashboardStyles.legendDot, { backgroundColor: item.color }]} /><Text style={dashboardStyles.legendName} numberOfLines={1}>{item.name}</Text><Text style={dashboardStyles.legendValue}>{formatCurrency(item.population)}</Text></View>)}</View> : null}
        </View>

        <View style={dashboardStyles.panel}>
          <View style={dashboardStyles.panelHeading}><View><Text style={dashboardStyles.panelTitle}>Your six-month rhythm</Text><Text style={dashboardStyles.panelSubtitle}>Income and outgoings over time</Text></View><Feather name="trending-up" size={17} color={colors.green} /></View>
          {trend.data?.some((point) => point.income || point.expense) ? <LineChart data={{ labels: trend.data.map((point) => shortMonth(point.month)), datasets: [{ data: trend.data.map((point) => point.expense), color: (opacity = 1) => `rgba(39,107,82,${opacity})`, strokeWidth: 2 }, { data: trend.data.map((point) => point.income), color: (opacity = 1) => `rgba(196,153,81,${opacity})`, strokeWidth: 2 }] }} width={chartWidth} height={205} chartConfig={chartConfig} bezier withDots withInnerLines withOuterLines={false} style={dashboardStyles.chart} /> : <DataState title="Not enough history yet" detail="Monthly activity will build a trend over time." />}
          <View style={dashboardStyles.keyRow}><View style={dashboardStyles.keyItem}><View style={[dashboardStyles.keyLine, { backgroundColor: colors.green }]} /><Text style={dashboardStyles.keyText}>Spent</Text></View><View style={dashboardStyles.keyItem}><View style={[dashboardStyles.keyLine, { backgroundColor: "#c49951" }]} /><Text style={dashboardStyles.keyText}>Income</Text></View></View>
        </View>

        <View style={dashboardStyles.panel}>
          <View style={dashboardStyles.panelHeading}><View><Text style={dashboardStyles.panelTitle}>A gentle look ahead</Text><Text style={dashboardStyles.panelSubtitle}>{forecastCategory ? `Estimated ${forecastCategory.toLowerCase()} spending` : "Category forecast"}</Text></View><View style={dashboardStyles.forecastBadge}><Text style={dashboardStyles.forecastBadgeText}>3 MONTHS</Text></View></View>
          {forecast.isPending && forecastCategory ? <ActivityIndicator color={colors.green} style={dashboardStyles.forecastLoader} /> : null}
          {forecast.data?.forecast.length ? <LineChart data={{ labels: [...forecast.data.historical.slice(-3).map((point) => shortMonth(point.month)), ...forecast.data.forecast.map((point) => shortMonth(point.month))], datasets: [{ data: [...forecast.data.historical.slice(-3).map((point) => point.amount), ...forecast.data.forecast.map((point) => point.amount)] }] }} width={chartWidth} height={190} chartConfig={{ ...chartConfig, color: (opacity = 1) => `rgba(109,141,181,${opacity})`, propsForDots: { r: "4", strokeWidth: "2", stroke: "#6d8db5" } }} bezier withDots withInnerLines withOuterLines={false} style={dashboardStyles.chart} /> : !forecast.isPending ? <DataState title="Forecast needs a little history" detail="Keep categorizing transactions to see an estimate here." /> : null}
        </View>
        <Text style={dashboardStyles.disclaimer}>Forecasts use recent patterns as a guide; your actual spending may vary.</Text>
      </ScrollView> : null}
    </AppScreen>
  );
}

function SummaryCard({ label, value, icon, tint, color }: { label: string; value: number; icon: "arrow-down-left" | "arrow-up-right" | "activity"; tint: string; color: string }) {
  return <View style={dashboardStyles.summaryCard}><View style={dashboardStyles.cardHeader}><Text style={dashboardStyles.cardEyebrow}>{label}</Text><View style={[dashboardStyles.cardIcon, { backgroundColor: tint }]}><Feather name={icon} size={14} color={color} /></View></View><Text style={dashboardStyles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(value)}</Text><Text style={dashboardStyles.cardHint}>this month</Text></View>;
}

const dashboardStyles = StyleSheet.create({
  content: { paddingHorizontal: 17, paddingTop: 14, paddingBottom: 30, gap: 13 },
  welcome: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 1 },
  welcomeTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", letterSpacing: -0.3 }, welcomeText: { color: colors.muted, fontSize: 11, marginTop: 3 },
  sparkle: { width: 35, height: 35, borderRadius: 12, backgroundColor: colors.greenWash, alignItems: "center", justifyContent: "center" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, summaryCard: { flexBasis: "48%", flexGrow: 1, minWidth: 135, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, cardEyebrow: { color: "#88928a", fontSize: 8, letterSpacing: 0.8, fontWeight: "700" },
  cardIcon: { width: 25, height: 25, borderRadius: 9, alignItems: "center", justifyContent: "center" }, summaryValue: { marginTop: 6, color: colors.ink, fontSize: 17, fontWeight: "700", letterSpacing: -0.4 }, summaryCount: { marginTop: 6, color: colors.ink, fontSize: 21, fontWeight: "700" }, cardHint: { marginTop: 2, color: "#a0a9a2", fontSize: 9 },
  panel: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 13 },
  panelHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 3, marginBottom: 6 }, panelTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" }, panelSubtitle: { color: colors.muted, fontSize: 9, marginTop: 3 },
  legend: { gap: 8, paddingHorizontal: 3, paddingBottom: 2 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 7 }, legendDot: { width: 7, height: 7, borderRadius: 4 }, legendName: { flex: 1, color: colors.muted, fontSize: 10 }, legendValue: { color: colors.ink, fontSize: 10, fontWeight: "600" },
  chart: { borderRadius: 12, marginLeft: -10, marginTop: 8 }, keyRow: { flexDirection: "row", justifyContent: "center", gap: 20 }, keyItem: { flexDirection: "row", alignItems: "center", gap: 6 }, keyLine: { width: 12, height: 3, borderRadius: 2 }, keyText: { color: colors.muted, fontSize: 9 },
  forecastBadge: { backgroundColor: "#edf1f6", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }, forecastBadgeText: { color: "#6d819e", fontSize: 8, fontWeight: "700", letterSpacing: 0.5 }, forecastLoader: { paddingVertical: 30 },
  disclaimer: { color: "#99a39b", fontSize: 9, lineHeight: 14, textAlign: "center", paddingHorizontal: 18 },
  stateArea: { flex: 1, alignItems: "center", justifyContent: "center" }, retry: { backgroundColor: colors.greenWash, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 }, retryText: { color: colors.green, fontSize: 12, fontWeight: "700" },
});
