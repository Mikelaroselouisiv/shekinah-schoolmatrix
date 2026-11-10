import React from 'react';
import { Platform } from 'react-native';

/**
 * Garde-fou typographique (comme Parallele Media Groupe).
 * React 19 ignore Text.defaultProps, donc on enveloppe le composant.
 *
 * Ne jamais faire `RN.Text = …` : dans React Native 0.86, Text et TextInput
 * sont des getters sans setter. L’assignation lève TypeError au chargement
 * et l’application reste blanche.
 */
function withReadableText(Component: React.ComponentType<any>, padEnd: boolean) {
  const Wrapped = React.forwardRef((props: any, ref: any) =>
    React.createElement(Component, {
      ...props,
      ref,
      allowFontScaling: props.allowFontScaling !== false,
      maxFontSizeMultiplier: props.maxFontSizeMultiplier ?? 1.2,
      ...(Platform.OS === 'android'
        ? { textBreakStrategy: props.textBreakStrategy ?? 'simple' }
        : {}),
      style: [padEnd && Platform.OS === 'android' ? { paddingRight: 2 } : null, props.style],
    }),
  );
  return Wrapped;
}

function install(name: 'Text' | 'TextInput', padEnd: boolean) {
  const RN = require('react-native');
  try {
    const Original = RN[name];
    if (Original == null) return;
    const Wrapped = withReadableText(Original, padEnd);
    const desc = Object.getOwnPropertyDescriptor(RN, name);
    if (!desc?.configurable) return;
    Object.defineProperty(RN, name, {
      configurable: true,
      enumerable: desc.enumerable !== false,
      get: () => Wrapped,
    });
  } catch {
    // Le démarrage ne doit jamais échouer à cause de ce garde-fou.
  }
}

install('Text', true);
install('TextInput', false);
