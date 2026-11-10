const { withAndroidStyles } = require('expo/config-plugins');

/**
 * Android 15 / 16 mesure le texte trop étroit (useBoundsForWidth).
 * Sur ces téléphones, la fin d’un libellé disparaît : deux mots n’en montrent qu’un.
 * Le thème force l’ancien calcul de largeur pour tous les TextView de l’app.
 */
const APP_THEME = 'AppTheme';
const STYLE_NAME = 'Widget.App.TextView';
const ITEMS = {
  'android:useBoundsForWidth': 'false',
  'android:elegantTextHeight': 'false',
  'android:shiftDrawingOffsetForStartOverhang': 'false',
  'android:useLocalePreferredLineHeightForMinimum': 'false',
};

function upsertItem(style, name, value) {
  const current = style.item;
  style.item = !current ? [] : Array.isArray(current) ? current : [current];
  const existing = style.item.find((item) => item?.$?.name === name);
  if (existing) existing._ = value;
  else style.item.push({ _: value, $: { name } });
}

function withAndroidTextMetrics(config) {
  return withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults;
    styles.resources = styles.resources ?? {};
    styles.resources.style = styles.resources.style ?? [];

    let style = styles.resources.style.find((item) => item?.$?.name === STYLE_NAME);
    if (!style) {
      style = { $: { name: STYLE_NAME, parent: 'Widget.AppCompat.TextView' }, item: [] };
      styles.resources.style.push(style);
    }
    for (const [name, value] of Object.entries(ITEMS)) upsertItem(style, name, value);

    const theme = styles.resources.style.find((item) => item?.$?.name === APP_THEME);
    if (theme) {
      upsertItem(theme, 'android:textViewStyle', `@style/${STYLE_NAME}`);
    }
    return cfg;
  });
}

module.exports = withAndroidTextMetrics;
