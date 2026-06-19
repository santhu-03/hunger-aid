import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { ScenarioAuditLogger } from '../services/validation/ScenarioAuditLogger';
import { RuntimeScenarioRunner } from '../services/validation/RuntimeScenarioRunner';
import { persistRuntimeAudit } from '../services/validation/RuntimeAuditPersistence';

export default function RuntimeValidator() {
  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeScenario, setActiveScenario] = useState('');

  const logger = useMemo(() => new ScenarioAuditLogger(setLogs), []);
  const runner = useMemo(() => new RuntimeScenarioRunner(logger), [logger]);

  const executeScenario = async (scenarioFn, title) => {
    setIsRunning(true);
    setActiveScenario(title);
    logger.clear();
    logger.header(`STARTING: ${title}`);
    try {
      await runner[scenarioFn]();
      logger.header(`COMPLETE: ${title}`);
      await persistRuntimeAudit(title, 'PASS', logger.getLogs());
    } catch (e) {
      logger.error(`Validation Halted: ${e.message}`);
      await persistRuntimeAudit(title, 'FAIL', logger.getLogs());
    }
    setIsRunning(false);
    setActiveScenario('');
  };

  const runAllScenarios = async () => {
    setIsRunning(true);
    setActiveScenario('All Runtime Tests');
    logger.clear();
    logger.header('STARTING FULL RUNTIME VALIDATION SUITE');
    
    try {
      await runner.runScenario1_HappyPath();
      await runner.runScenario2_RejectReassign();
      await runner.runScenario3_OTPVerification();
      await runner.runScenario4_OfflineRecovery();
      
      logger.header('RUNTIME VALIDATION SUITE COMPLETE');
      logger.success('All live scenarios executed successfully!');
      await persistRuntimeAudit('All Runtime Tests', 'PASS', logger.getLogs());
    } catch (e) {
      logger.error(`Validation Suite Halted: ${e.message}`);
      await persistRuntimeAudit('All Runtime Tests', 'FAIL', logger.getLogs());
    }
    
    setIsRunning(false);
    setActiveScenario('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <FontAwesome5 name="vial" size={28} color="#1976d2" />
        <Text style={styles.title}>Runtime Validation Dashboard</Text>
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.btn, styles.btnSecondary]} 
          onPress={() => executeScenario('runScenario2_RejectReassign', 'Scenario 2')} 
          disabled={isRunning}
        >
          <Text style={styles.btnTextSecondary}>Run Scenario 2</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, styles.btnSecondary]} 
          onPress={() => executeScenario('runScenario3_OTPVerification', 'Scenario 3')} 
          disabled={isRunning}
        >
          <Text style={styles.btnTextSecondary}>Run Scenario 3</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, styles.btnSecondary]} 
          onPress={() => executeScenario('runScenario4_OfflineRecovery', 'Scenario 4')} 
          disabled={isRunning}
        >
          <Text style={styles.btnTextSecondary}>Run Scenario 4</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, styles.btnPrimary]} 
          onPress={runAllScenarios} 
          disabled={isRunning}
        >
          <Text style={styles.btnTextPrimary}>Run All Runtime Tests</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logHeader}>
        <Text style={styles.logTitle}>Live Runtime Output & Event Traces</Text>
        {isRunning && (
          <View style={styles.runningBadge}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.runningText}>{activeScenario}...</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.console} contentContainerStyle={styles.consoleContent}>
        {logs.length === 0 && !isRunning && (
          <View style={styles.emptyState}>
            <FontAwesome5 name="terminal" size={32} color="#555" />
            <Text style={styles.emptyText}>Select a scenario above to begin live runtime validation.</Text>
          </View>
        )}

        {logs.map((log, i) => {
          const isPass = log.msg.includes('[PASS]');
          const isFail = log.msg.includes('[FAIL]');
          const isHeader = log.type === 'header';

          return (
            <View key={i} style={[
              styles.logRow,
              isHeader && styles.logRowHeader,
              isPass && styles.logRowPass,
              isFail && styles.logRowFail,
            ]}>
              <View style={styles.logMeta}>
                <Text style={styles.logTime}>[{log.time}]</Text>
                {isPass && <View style={styles.badgePass}><Text style={styles.badgeText}>PASS</Text></View>}
                {isFail && <View style={styles.badgeFail}><Text style={styles.badgeText}>FAIL</Text></View>}
              </View>
              <Text style={[
                styles.logText,
                isHeader && styles.logTextHeader,
                isPass && styles.logTextPass,
                isFail && styles.logTextFail,
              ]}>
                {log.msg.replace('[PASS]', '').replace('[FAIL]', '').trim()}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f0f4f8' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#102a43' },
  buttonContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  btn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9e2ec' },
  btnTextSecondary: { color: '#334e68', fontWeight: 'bold', fontSize: 14 },
  btnPrimary: { backgroundColor: '#1976d2' },
  btnTextPrimary: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#243b53', paddingHorizontal: 16, paddingVertical: 12, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  logTitle: { color: '#f0f4f8', fontWeight: 'bold', fontSize: 14, letterSpacing: 0.5 },
  runningBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#d97706', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, gap: 8 },
  runningText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  console: { flex: 1, backgroundColor: '#102a43', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, padding: 12 },
  consoleContent: { paddingBottom: 20 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#627d98', fontSize: 14 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 10 },
  logRowHeader: { marginTop: 12, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#334e68', paddingBottom: 4 },
  logRowPass: { backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 4, borderRadius: 4 },
  logRowFail: { backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 4, borderRadius: 4 },
  logMeta: { width: 130, flexDirection: 'row', alignItems: 'center', gap: 6 },
  logTime: { color: '#829ab1', fontFamily: 'monospace', fontSize: 12 },
  badgePass: { backgroundColor: '#10b981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeFail: { backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  logText: { flex: 1, color: '#d9e2ec', fontFamily: 'monospace', fontSize: 13, lineHeight: 18 },
  logTextHeader: { color: '#facc15', fontWeight: 'bold', fontSize: 14 },
  logTextPass: { color: '#34d399', fontWeight: 'bold' },
  logTextFail: { color: '#f87171', fontWeight: 'bold' },
});
