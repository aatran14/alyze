export const SHORT = {
  'tokenize only (case sensitive)': 'tokenize',
  '+ lowercase': '+ lower',
  '+ stopwords': '+ stopwords',
  '+ stemming': '+ stemming',
  'full pipeline': 'full pipeline',
  'word break + word_like': 'word + word_like',
  'word break': 'word break',
  'sentence break': 'sentence break',
}

export const COLORS = ['#1e293b', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#4ade80', '#f0abfc', '#334155']

export const GROUPS = {
  wikipedia: ['word break', 'word break + word_like', 'sentence break'],
  analysis: ['tokenize only (case sensitive)', '+ lowercase', '+ stopwords', '+ stemming', 'full pipeline'],
}

export const FAMILY_ORDER = ['c4-', 'c4d-', 'c4a-']

export const TABLE_COLS =
  '<colgroup><col class="col-lbl"><col class="col-base"><col class="col-val"></colgroup>'

export function chartKnobs(group) {
  return {
    CHART_H: 280,
    CHART_PADDING: { t: 68, r: 150, b: 80, l: 52 },
    DATE_SPACING: 35,
    MAX_DATE_SLOTS: 14,
    Y_RANGE: group === 'wikipedia' ? [200, 450] : [50, 350],
    Y_STEP: 50,
    Y_LABEL_GAP: 10,
    TITLE_X: 10,
    TITLE_Y: 22,
    TITLE_SIZE: 12,
    MACHINE_Y: 36,
    MACHINE_SIZE: 10,
    LEGEND_GAP: 16,
    LEGEND_TOP: 48,
    LEGEND_SPACING: 20,
    LEGEND_DOT_R: 4,
    LEGEND_FONT: 11,
    LINE_WIDTH: 2,
    DOT_R: 4,
  }
}
