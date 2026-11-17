import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { AppScreen, colors } from '../src/components/AppScreen';
import type { UploadResult } from '../src/lib/api';
import { uploadCsv } from '../src/lib/upload';

export default function UploadScreen() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  const chooseFile = async () => {
    setError('');
    setResult(null);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/vnd.ms-excel', 'text/csv'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (selection.canceled) return;
      const file = selection.assets[0];

      if (!file.name.toLowerCase().endsWith('.csv')) {
        setError('Choose a .csv file to import transactions.');
        return;
      }
      if (file.size !== undefined && file.size > 5 * 1024 * 1024) {
        setError('This file is larger than the 5 MB limit.');
        return;
      }

      setBusy(true);
      setProgress(0);

      // FIX: On web, we need the actual File object, not just the URI string
      const fileToUpload = (file as any).file || file.uri;

      const upload = await uploadCsv(fileToUpload, file.name, setProgress);
      setResult(upload);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We couldn't upload this file. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen title="Bring it all together" eyebrow="Import transactions">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Feather name="layers" size={17} color={colors.green} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>One clear picture</Text>
            <Text style={styles.introText}>
              Upload a bank CSV and Ledgerly will organize the transactions for
              you.
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void chooseFile()}
          style={({ pressed }) => [
            styles.dropZone,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          <View style={styles.uploadIcon}>
            <Feather
              name={busy ? 'loader' : 'upload-cloud'}
              size={21}
              color={colors.green}
            />
          </View>
          <Text style={styles.dropTitle}>
            {busy
              ? 'Adding your transactions…'
              : result
                ? 'Add another file'
                : 'Choose a CSV file'}
          </Text>
          <Text style={styles.dropDetail}>
            {busy
              ? 'Keep Ledgerly open while we upload.'
              : 'Choose a file from your device or cloud drive.'}
          </Text>
          <View style={styles.chooseButton}>
            <Text style={styles.chooseText}>
              {busy ? 'Uploading' : 'Browse files'}
            </Text>
          </View>
          <Text style={styles.fileHint}>CSV · up to 5 MB</Text>
        </Pressable>

        {busy ? (
          <View style={styles.progressCard}>
            <View style={styles.progressTop}>
              <Text style={styles.progressLabel}>Uploading securely</Text>
              <Text style={styles.progressValue}>{progress}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <View style={styles.progressFooter}>
              <ActivityIndicator size="small" color={colors.green} />
              <Text style={styles.progressNote}>
                Your file is processed only for your account.
              </Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={17} color={colors.red} />
            <View style={styles.messageText}>
              <Text style={styles.errorTitle}>We couldn't add that file</Text>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
            <Pressable
              onPress={() => setError('')}
              accessibilityLabel="Dismiss error"
            >
              <Feather name="x" size={17} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}

        {result ? (
          <View style={styles.resultCard}>
            <View style={styles.resultHeading}>
              <View style={styles.successIcon}>
                <Feather name="check" size={17} color={colors.green} />
              </View>
              <View style={styles.resultHeadingCopy}>
                <Text style={styles.resultTitle}>Your file is in</Text>
                <Text style={styles.resultSubtitle}>
                  Import completed successfully.
                </Text>
              </View>
            </View>
            <View style={styles.countRow}>
              <CountTile
                label="ACCEPTED"
                value={result.accepted_rows}
                positive
              />
              <CountTile
                label="SKIPPED"
                value={result.skipped_rows}
                positive={false}
              />
            </View>
            {result.warning ? (
              <View style={styles.warning}>
                <Feather name="info" size={14} color="#a2773b" />
                <Text style={styles.warningText}>{result.warning}</Text>
              </View>
            ) : null}
            {result.errors.length ? (
              <View style={styles.errors}>
                <Text style={styles.errorsTitle}>Rows to review</Text>
                {result.errors.slice(0, 5).map((item, index) => (
                  <Text key={`${item.row}-${index}`} style={styles.rowError}>
                    Row {item.row}: {item.message}
                  </Text>
                ))}
                {result.errors.length > 5 ? (
                  <Text style={styles.rowError}>
                    And {result.errors.length - 5} more skipped rows.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.formatCard}>
          <Text style={styles.formatTitle}>A small note about your file</Text>
          <FormatRow
            icon="calendar"
            text="Include a date in YYYY-MM-DD or MM/DD/YYYY format."
          />
          <FormatRow
            icon="align-left"
            text="Add a description column for each transaction."
          />
          <FormatRow
            icon="dollar-sign"
            text="Expenses should be negative and income positive."
          />
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function CountTile({
  label,
  value,
  positive,
}: {
  label: string;
  value: number;
  positive: boolean;
}) {
  return (
    <View style={styles.countTile}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text
        style={[
          styles.countValue,
          !positive && value > 0 && styles.skippedValue,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.countCaption}>transactions</Text>
    </View>
  );
}

function FormatRow({
  icon,
  text,
}: {
  icon: 'calendar' | 'align-left' | 'dollar-sign';
  text: string;
}) {
  return (
    <View style={styles.formatRow}>
      <Feather name={icon} size={14} color={colors.green} />
      <Text style={styles.formatText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 13,
    paddingBottom: 28,
  },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  introIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: colors.greenWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: { flex: 1 },
  introTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  introText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  dropZone: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#c9d9ce',
    backgroundColor: '#fbfcfa',
    borderRadius: 17,
  },
  pressed: { opacity: 0.83 },
  disabled: { opacity: 0.75 },
  uploadIcon: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.greenWash,
  },
  dropTitle: {
    marginTop: 12,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  dropDetail: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 10,
    textAlign: 'center',
  },
  chooseButton: {
    marginTop: 15,
    paddingHorizontal: 17,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: colors.green,
  },
  chooseText: { color: 'white', fontSize: 10, fontWeight: '700' },
  fileHint: { marginTop: 9, color: '#9ba49d', fontSize: 9 },
  progressCard: {
    padding: 14,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  progressValue: { color: colors.green, fontSize: 11, fontWeight: '700' },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#edf1ed',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 4, backgroundColor: colors.green },
  progressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
  },
  progressNote: { color: colors.muted, fontSize: 9 },
  resultCard: {
    padding: 14,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
  },
  resultHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  successIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenWash,
  },
  resultHeadingCopy: { flex: 1 },
  resultTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  resultSubtitle: { color: colors.muted, fontSize: 9, marginTop: 3 },
  countRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  countTile: {
    flex: 1,
    backgroundColor: '#f8faf7',
    borderRadius: 11,
    padding: 11,
  },
  countLabel: {
    color: '#929b94',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  countValue: {
    color: colors.green,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 3,
  },
  skippedValue: { color: '#b5794b' },
  countCaption: { color: colors.muted, fontSize: 8 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 11,
    padding: 10,
    backgroundColor: '#fbf5e9',
    borderRadius: 10,
  },
  warningText: { flex: 1, color: '#886932', fontSize: 9, lineHeight: 14 },
  errors: {
    marginTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  errorsTitle: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 5,
  },
  rowError: { color: colors.muted, fontSize: 9, lineHeight: 15 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fbefed',
    borderWidth: 1,
    borderColor: '#f0d5d0',
  },
  messageText: { flex: 1 },
  errorTitle: { color: colors.red, fontSize: 11, fontWeight: '700' },
  errorMessage: {
    color: '#8e5a53',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  formatCard: {
    padding: 14,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    gap: 11,
  },
  formatTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 1,
  },
  formatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  formatText: { flex: 1, color: colors.muted, fontSize: 9, lineHeight: 14 },
});
