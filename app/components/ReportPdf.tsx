import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  header: { backgroundColor: "#1e40af", padding: 20, marginBottom: 20 },
  headerTitle: { color: "white", fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  headerSubtitle: { color: "#bfdbfe", fontSize: 10 },
  confidenceBadge: { backgroundColor: "#ffffff20", padding: "4 12", borderRadius: 12, fontSize: 10, color: "white", alignSelf: "flex-start", marginTop: 8 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#1e40af", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 6, marginBottom: 10 },
  grid: { flexDirection: "row", gap: 20 },
  col: { flex: 1 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { color: "#2563eb", marginRight: 6, fontSize: 10 },
  bulletText: { fontSize: 10, flex: 1 },
  greenCard: { borderWidth: 2, borderColor: "#16a34a", borderRadius: 8, padding: 14, marginBottom: 10, backgroundColor: "#f0fdf4" },
  greenText: { color: "#166534", fontSize: 10 },
  strategicCard: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8 },
  recommendedBadge: { fontSize: 8, color: "#16a34a", fontWeight: "bold", marginBottom: 4 },
  strategicTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 4 },
  strategicSummary: { fontSize: 9, color: "#4b5563" },
  diffText: { fontSize: 9, color: "#9ca3af" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

interface ReportPdfProps {
  report: {
    title: string;
    executiveSummary: string;
    confidenceScore: number;
    currentPositioning?: {
      mainCompany?: { name?: string; description?: string };
      keyFindings?: string[];
    };
    competitorAnalysis?: {
      marketPosition?: string;
      competitiveAdvantages?: string[];
      weaknesses?: string[];
    };
    nextBigThingOptions?: Array<{
      id?: number;
      title?: string;
      summary?: string;
      difficulty?: number;
    }>;
    recommendedStrategy?: { title?: string; summary?: string };
  };
  companyName?: string;
  competitors?: Array<{ name?: string; description?: string; websiteUrl?: string }>;
}

export function ReportPdf({ report, companyName, competitors }: ReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>Strategic Analysis Report</Text>
          <Text style={styles.headerTitle}>{report.title}</Text>
          <Text style={[styles.headerSubtitle, { marginTop: 6 }]}>{report.executiveSummary}</Text>
          <Text style={styles.confidenceBadge}>
            Confidence: {Math.round(report.confidenceScore * 100)}%
          </Text>
        </View>

        {/* Current Market Position */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Market Position</Text>
          <View style={styles.grid}>
            <View style={styles.col}>
              <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Your Company</Text>
              <Text style={{ fontSize: 10, color: "#4b5563" }}>
                {report.currentPositioning?.mainCompany?.name || companyName || "N/A"}
              </Text>
              {report.currentPositioning?.mainCompany?.description && (
                <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>
                  {report.currentPositioning.mainCompany.description}
                </Text>
              )}
            </View>
            <View style={styles.col}>
              <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Key Findings</Text>
              {(report.currentPositioning?.keyFindings || []).map((f, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Competitor Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Competitor Analysis</Text>
          <Text style={{ fontSize: 10, color: "#4b5563", marginBottom: 10 }}>
            {report.competitorAnalysis?.marketPosition || "N/A"}
          </Text>
          <View style={styles.grid}>
            <View style={styles.col}>
              <Text style={[styles.cardTitle, { color: "#16a34a", marginBottom: 6 }]}>Competitive Advantages</Text>
              {(report.competitorAnalysis?.competitiveAdvantages || []).map((adv, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={[styles.bulletDot, { color: "#16a34a" }]}>✓</Text>
                  <Text style={styles.bulletText}>{adv}</Text>
                </View>
              ))}
            </View>
            <View style={styles.col}>
              <Text style={[styles.cardTitle, { color: "#dc2626", marginBottom: 6 }]}>Areas for Improvement</Text>
              {(report.competitorAnalysis?.weaknesses || []).map((w, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={[styles.bulletDot, { color: "#dc2626" }]}>!</Text>
                  <Text style={styles.bulletText}>{w}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Strategic Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Strategic Options</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(report.nextBigThingOptions || []).map((option, i) => (
              <View
                key={i}
                style={[
                  styles.strategicCard,
                  report.recommendedStrategy?.id === option.id && { borderColor: "#16a34a", borderWidth: 2 },
                ]}
              >
                {report.recommendedStrategy?.id === option.id && (
                  <Text style={styles.recommendedBadge}>★ Recommended</Text>
                )}
                <Text style={styles.strategicTitle}>{option.title}</Text>
                <Text style={styles.strategicSummary}>{option.summary}</Text>
                <Text style={styles.diffText}>Difficulty: {option.difficulty}/10</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recommended Strategy */}
        {report.recommendedStrategy && (
          <View style={[styles.section, { backgroundColor: "#f0fdf4", padding: 16, borderRadius: 8, borderWidth: 1, borderColor: "#16a34a" }]}>
            <Text style={[styles.headerSubtitle, { color: "#166534" }]}>Recommended Strategy</Text>
            <Text style={[styles.headerTitle, { fontSize: 16, color: "#166534" }]}>
              {report.recommendedStrategy.title}
            </Text>
            <Text style={{ fontSize: 10, color: "#166534", marginTop: 4 }}>
              {report.recommendedStrategy.summary}
            </Text>
          </View>
        )}

        <Text style={styles.footer}>
          Generated by The Next Big Thing Theory • {new Date().toLocaleDateString()}
        </Text>
      </Page>
    </Document>
  );
}
