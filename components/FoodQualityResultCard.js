import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function FoodQualityResultCard({ result, onReRun }) {
  const router = useRouter();

  if (!result) return null;

  const {
    qualityStatus,
    confidenceScore,
    spoilageIndicators,
    riskLevel,
    shortDescription,
    recommendation,
    estimatedSafeUseWindow
  } = result;

  const isSpoiled = qualityStatus === 'Spoiled';
  const isCaution = qualityStatus === 'Caution';
  const isSafe = qualityStatus === 'Safe';

  let badgeColor = '#4caf50'; // Safe
  let badgeIcon = '✅';
  if (isCaution) {
    badgeColor = '#ff9800';
    badgeIcon = '⚠️';
  } else if (isSpoiled) {
    badgeColor = '#f44336';
    badgeIcon = '❌';
  }

  const handleProceed = () => {
    // Navigate to Donation screen if safe or caution. 
    router.push('/DonationScreen');
  };

  return (
    <View style={styles.card}>
      <View style={[styles.header, { backgroundColor: badgeColor }]}>
        <Text style={styles.headerText}>{badgeIcon} {qualityStatus.toUpperCase()}</Text>
      </View>
      
      <View style={styles.body}>
        <Text style={styles.description}>{shortDescription}</Text>
        
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Confidence</Text>
            <Text style={styles.statValue}>{confidenceScore}%</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Risk Level</Text>
            <Text style={[styles.statValue, { color: isSpoiled ? 'red' : (isCaution ? 'orange' : 'green') }]}>
              {riskLevel}
            </Text>
          </View>
        </View>

        {spoilageIndicators && spoilageIndicators.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detected Concerns:</Text>
            {spoilageIndicators.map((indicator, idx) => (
              <Text key={idx} style={styles.listItem}>• {indicator}</Text>
            ))}
          </View>
        )}

        {estimatedSafeUseWindow && (
           <View style={styles.section}>
             <Text style={styles.sectionTitle}>Est. Safe Window:</Text>
             <Text style={styles.text}>{estimatedSafeUseWindow}</Text>
           </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommendation:</Text>
          <Text style={styles.recommendationText}>{recommendation}</Text>
        </View>

        <View style={styles.actionRow}>
          {isSpoiled ? (
            <View style={styles.blockedAlert}>
              <Text style={styles.blockedText}>Donation Blocked: Food appears spoiled.</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.proceedBtn} onPress={handleProceed}>
              <Text style={styles.proceedBtnText}>Proceed to Donate</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.rerunBtn} onPress={onReRun}>
            <Text style={styles.rerunBtnText}>Re-analyze</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 16,
    marginBottom: 20,
    elevation: 3,
  },
  header: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  body: {
    padding: 16,
  },
  description: {
    fontSize: 15,
    color: '#333',
    marginBottom: 16,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginTop: 4,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 4,
  },
  listItem: {
    fontSize: 14,
    color: '#616161',
    marginLeft: 8,
  },
  text: {
    fontSize: 14,
    color: '#616161',
  },
  recommendationText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1976d2',
  },
  actionRow: {
    marginTop: 16,
    gap: 10,
  },
  proceedBtn: {
    backgroundColor: '#2e7d32',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  proceedBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  blockedAlert: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef9a9a',
    alignItems: 'center',
  },
  blockedText: {
    color: '#c62828',
    fontWeight: 'bold',
    fontSize: 15,
  },
  rerunBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bdbdbd',
    borderRadius: 8,
  },
  rerunBtnText: {
    color: '#616161',
    fontSize: 15,
    fontWeight: '600',
  },
});
