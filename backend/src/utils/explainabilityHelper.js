/**
 * Project Vigilance — AML Explainability & Evidence Presentation Helper
 * ======================================================================
 * Transforms raw model inference outputs and engineered features into
 * structured, investigator-friendly evidence categories with honest AML disclosures.
 *
 * Invariants:
 * - Does NOT fabricate explanations or claim feature causality without genuine local attribution.
 * - Adheres strictly to approved formula: FINAL_RISK_SCORE = 0.80 * XGB + 0.20 * IF.
 * - Distinguishes between statistical outlier detection (IF) and supervised probability (XGB).
 * - Avoids sensationalist or legally conclusive language (e.g. "criminal", "definitely laundering").
 */

/**
 * Extracts and categorizes explainability evidence from analysis or case data.
 * @param {Object} record - AmlAnalysis or InvestigationCase document/object.
 * @param {Object} [features] - Raw or engineered feature dictionary.
 * @returns {Object} Structured evidence object.
 */
function extractExplainabilityEvidence(record, features = null) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  // Fallback to embedded features snapshot if not explicitly provided
  const feat = features || record.features_snapshot || {};

  // 1. Extract raw & normalized sub-model scores
  const xgbScore = typeof record.xgb_score === 'number'
    ? record.xgb_score
    : (typeof record.xgb_score_snapshot === 'number' ? record.xgb_score_snapshot : 0.0);

  const ifScore = typeof record.isolation_forest_score === 'number'
    ? record.isolation_forest_score
    : (typeof record.isolation_forest_score_snapshot === 'number' ? record.isolation_forest_score_snapshot : 0.0);

  const ifRawScore = typeof record.isolation_forest_raw_score === 'number'
    ? record.isolation_forest_raw_score
    : (typeof feat.isolation_forest_raw_score === 'number' ? feat.isolation_forest_raw_score : null);

  const xgbProb = typeof record.xgb_probability === 'number'
    ? record.xgb_probability
    : (xgbScore / 100.0);

  const finalScore = typeof record.final_risk_score === 'number'
    ? record.final_risk_score
    : (typeof record.risk_score_snapshot === 'number' ? record.risk_score_snapshot : 0.0);

  const riskTier = record.risk_tier || record.risk_tier_snapshot || 'LOW';

  // 2. Risk Score Mathematical Breakdown
  const xgbWeight = 0.80;
  const ifWeight = 0.20;
  const xgbContribution = Number((xgbWeight * xgbScore).toFixed(2));
  const ifContribution = Number((ifWeight * ifScore).toFixed(2));

  const riskBreakdown = {
    xgb_score: Number(xgbScore.toFixed(2)),
    xgb_probability: Number(xgbProb.toFixed(4)),
    xgb_weight: xgbWeight,
    xgb_contribution: xgbContribution,
    isolation_forest_score: Number(ifScore.toFixed(2)),
    isolation_forest_raw_score: ifRawScore !== null ? Number(ifRawScore.toFixed(4)) : null,
    isolation_forest_weight: ifWeight,
    isolation_forest_contribution: ifContribution,
    final_risk_score: Number(finalScore.toFixed(2)),
    risk_tier: riskTier,
    formula_text: 'FINAL_RISK_SCORE = 0.80 * XGB_SCORE + 0.20 * IF_SCORE',
    mathematically_consistent: Math.abs((xgbContribution + ifContribution) - finalScore) < 0.2,
  };

  // 3. Sub-Model Explanations
  const isAnomalous = ifRawScore !== null ? ifRawScore >= 0.50 : ifScore >= 50.0;
  const modelSignals = {
    xgboost: {
      probability: Number((xgbProb * 100).toFixed(2)),
      score: Number(xgbScore.toFixed(2)),
      signal_type: 'Supervised Typology Likelihood',
      disclosure:
        'Supervised gradient boosting estimates the statistical similarity to previously confirmed laundering patterns. Feature values are model inputs, not proof of financial crime.',
    },
    isolation_forest: {
      raw_score: ifRawScore !== null ? Number(ifRawScore.toFixed(4)) : null,
      score: Number(ifScore.toFixed(2)),
      is_outlier: isAnomalous,
      signal_type: 'Unsupervised Distribution Anomaly',
      diagnostic_assessment: isAnomalous
        ? "Transaction exhibits anomalous behavior relative to the model's learned background distribution."
        : "Transaction exhibits feature density consistent with nominal background distribution.",
      disclosure:
        'Isolation Forest detects statistical deviations from the background feature distribution. It does not identify a specific criminal typology or prove intent.',
    },
  };

  // 4. Behavioral Evidence Grouping
  // Helper to safely extract numeric values
  const num = (val, defaultVal = null) => {
    return typeof val === 'number' && isFinite(val) ? val : defaultVal;
  };

  // Determine channel string
  let detectedChannel = 'Unknown';
  if (feat.channel) detectedChannel = String(feat.channel);
  else if (feat.channel_UPI === 1) detectedChannel = 'UPI';
  else if (feat.channel_IMPS === 1) detectedChannel = 'IMPS';
  else if (feat.channel_NEFT === 1) detectedChannel = 'NEFT';
  else if (feat.channel_RTGS === 1) detectedChannel = 'RTGS';
  else if (feat.channel_Card === 1) detectedChannel = 'Card';
  else if (feat.channel_Crypto_Gateway === 1) detectedChannel = 'Crypto Gateway';

  // Determine currency
  let detectedCurrency = 'INR';
  if (feat.currency) detectedCurrency = String(feat.currency);
  else if (feat.currency_USDT === 1) detectedCurrency = 'USDT';
  else if (feat.currency_INR === 1) detectedCurrency = 'INR';

  const isCrypto = feat.is_crypto === 1 || feat.is_crypto === true || detectedChannel === 'Crypto Gateway' || detectedCurrency === 'USDT';
  const isCrossBorder = feat.is_cross_border === 1 || feat.is_cross_border === true;
  const amount = num(feat.amount);

  const behavioralEvidence = {
    transaction: {
      amount,
      log_amount: num(feat.log_amount),
      currency: detectedCurrency,
      channel: detectedChannel,
      is_crypto: isCrypto,
      is_cross_border: isCrossBorder,
      transaction_hour: num(feat.transaction_hour),
      is_weekend: feat.is_weekend === 1 || feat.is_weekend === true,
    },
    sender: {
      velocity_1h: {
        txn_count: num(feat.sender_txn_count_prev_1h, 0),
        amount_sum: num(feat.sender_amount_sum_prev_1h, 0),
        unique_receivers: num(feat.sender_unique_receivers_prev_1h, 0),
      },
      velocity_24h: {
        txn_count: num(feat.sender_txn_count_prev_24h, 0),
        amount_sum: num(feat.sender_amount_sum_prev_24h, 0),
        unique_receivers: num(feat.sender_unique_receivers_prev_24h, 0),
      },
      historical: {
        txn_count: num(feat.sender_txn_count_historical, 0),
        amount_avg: num(feat.sender_amount_avg_historical, 0),
        amount_std: num(feat.sender_amount_std_historical, 0),
        amount_to_avg_ratio: num(feat.amount_to_sender_avg_ratio, 1.0),
        amount_zscore: num(feat.sender_amount_zscore_historical, 0.0),
        crypto_txns: num(feat.sender_crypto_txn_count_historical, 0),
      },
    },
    receiver: {
      velocity_1h: {
        txn_count: num(feat.receiver_txn_count_prev_1h, 0),
        amount_sum: num(feat.receiver_amount_sum_prev_1h, 0),
        unique_senders: num(feat.receiver_unique_senders_prev_1h, 0),
      },
      velocity_24h: {
        txn_count: num(feat.receiver_txn_count_prev_24h, 0),
        amount_sum: num(feat.receiver_amount_sum_prev_24h, 0),
        unique_senders: num(feat.receiver_unique_senders_prev_24h, 0),
      },
      historical: {
        txn_count: num(feat.receiver_txn_count_historical, 0),
        amount_avg: num(feat.receiver_amount_avg_historical, 0),
        amount_to_avg_ratio: num(feat.amount_to_receiver_avg_ratio, 1.0),
        amount_zscore: num(feat.receiver_amount_zscore_historical, 0.0),
      },
    },
    entities: {
      device: {
        txn_count_historical: num(feat.device_txn_count_historical, 0),
        unique_accounts: num(feat.device_unique_accounts_historical, 0),
        unique_customers: num(feat.device_unique_customers_historical, 0),
        txn_count_prev_1h: num(feat.device_txn_count_prev_1h, 0),
        txn_count_prev_24h: num(feat.device_txn_count_prev_24h, 0),
      },
      ip: {
        txn_count_historical: num(feat.ip_txn_count_historical, 0),
        unique_accounts: num(feat.ip_unique_accounts_historical, 0),
        unique_customers: num(feat.ip_unique_customers_historical, 0),
        txn_count_prev_1h: num(feat.ip_txn_count_prev_1h, 0),
        txn_count_prev_24h: num(feat.ip_txn_count_prev_24h, 0),
      },
    },
  };

  // 5. Graph Analytics Evidence
  const graphEvidence = {
    sender: {
      pagerank: num(feat.sender_pagerank_score, 0.0),
      louvain_community_id: feat.sender_louvain_community_id !== undefined ? String(feat.sender_louvain_community_id) : 'N/A',
      in_degree: num(feat.sender_in_degree, 0),
      out_degree: num(feat.sender_out_degree, 0),
      participates_in_cycle: feat.sender_participates_in_cycle === 1 || feat.sender_participates_in_cycle === true,
      shortest_cycle_length: num(feat.sender_shortest_cycle_length, null),
      total_cycle_count: num(feat.sender_total_cycle_count, 0),
      cycle_counts: {
        len2: num(feat.sender_cycle_count_len2, 0),
        len3: num(feat.sender_cycle_count_len3, 0),
        len4: num(feat.sender_cycle_count_len4, 0),
      },
    },
    receiver: {
      pagerank: num(feat.receiver_pagerank_score, 0.0),
      louvain_community_id: feat.receiver_louvain_community_id !== undefined ? String(feat.receiver_louvain_community_id) : 'N/A',
      in_degree: num(feat.receiver_in_degree, 0),
      out_degree: num(feat.receiver_out_degree, 0),
      participates_in_cycle: feat.receiver_participates_in_cycle === 1 || feat.receiver_participates_in_cycle === true,
      shortest_cycle_length: num(feat.receiver_shortest_cycle_length, null),
      total_cycle_count: num(feat.receiver_total_cycle_count, 0),
      cycle_counts: {
        len2: num(feat.receiver_cycle_count_len2, 0),
        len3: num(feat.receiver_cycle_count_len3, 0),
        len4: num(feat.receiver_cycle_count_len4, 0),
      },
    },
    glossary: {
      pagerank: 'Measures structural importance of the account within the transaction network.',
      louvain: 'Identifies the structural graph community containing the account.',
      degree: 'Shows the number of observed incoming/outgoing transaction counterparty relationships.',
      cycle: 'Indicates participation in a circular transaction pattern in the analyzed graph.',
    },
    cautionary_notice:
      'Graph metrics reflect structural topology within the 150k transaction network. They are investigation indicators, not proof of financial crime.',
  };

  // 6. Compliance & Regulatory Signals
  const nearRegulatoryCount = num(feat.sender_near_regulatory_threshold_txns_prev_24h, 0);
  const regulatoryBoundary = 10000.0;
  const isNearThreshold = (amount !== null && amount >= 9000.0 && amount < regulatoryBoundary) || nearRegulatoryCount > 0;

  const complianceSignals = {
    regulatory_ctr_boundary: regulatoryBoundary,
    transaction_amount: amount,
    is_near_regulatory_threshold: isNearThreshold,
    near_threshold_txns_prev_24h: nearRegulatoryCount,
    is_cross_border: isCrossBorder,
    is_crypto: isCrypto,
    summary_notes: [
      isNearThreshold ? 'Transaction amount or recent velocity is within 10% of Cash Transaction Reporting (CTR) boundary.' : null,
      isCrossBorder ? 'International / Cross-Border routing flag active.' : null,
      isCrypto ? 'Crypto asset or gateway rail utilized.' : null,
    ].filter(Boolean),
  };

  return {
    risk_breakdown: riskBreakdown,
    model_signals: modelSignals,
    behavioral_evidence: behavioralEvidence,
    graph_evidence: graphEvidence,
    compliance_signals: complianceSignals,
  };
}

module.exports = {
  extractExplainabilityEvidence,
};
