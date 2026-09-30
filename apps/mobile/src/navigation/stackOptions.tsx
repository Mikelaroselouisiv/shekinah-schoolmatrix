import { Pressable } from 'react-native';
import { HeaderBackButton } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { colors } from '../theme/tokens';

type OptsArgs = {
  navigation: {
    canGoBack: () => boolean;
    navigate: (name: string) => void;
    goBack: () => void;
  };
  route: { name: string };
};

/**
 * Options communes à tous les stacks :
 * flèche retour visible sur chaque écran empilé (pas seulement quand
 * l’historique natif est présent — navigation croisée onglets, etc.).
 */
export function stackScreenOptions(
  rootRouteName: string,
  opts?: { showMenu?: boolean },
): (args: OptsArgs) => NativeStackNavigationOptions {
  const showMenu = opts?.showMenu !== false;
  return ({ navigation, route }) => {
    const isRoot = route.name === rootRouteName;

    return {
      headerShadowVisible: false,
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
      headerTitleStyle: { fontWeight: '700', color: colors.text },
      headerBackButtonDisplayMode: 'minimal',
      // Une seule flèche : custom headerLeft (pas la flèche native en plus)
      headerBackVisible: false,
      headerLeft: isRoot
        ? undefined
        : (props) => (
            <HeaderBackButton
              {...props}
              displayMode="minimal"
              tintColor={colors.text}
              accessibilityLabel="Retour"
              backImage={() => (
                <Ionicons name="chevron-back" size={28} color={colors.text} style={{ marginLeft: -4 }} />
              )}
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate(rootRouteName);
              }}
            />
          ),
      headerRight: showMenu
        ? () => (
            <Pressable
              onPress={() => navigation.navigate('Menu')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Menu"
              style={{ marginRight: 4, padding: 4 }}
            >
              <Ionicons name="menu-outline" size={26} color={colors.text} />
            </Pressable>
          )
        : undefined,
    };
  };
}
