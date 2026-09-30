import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import type { ReactNode } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useAuth } from '../../context/AuthContext';
import { useSchool } from '../../context/SchoolContext';
import { getVisibleFamilies, screensForFamilyVisible } from '../../lib/permissions';
import { FAMILY_ICONS, SCREEN_ICONS, openProductScreen } from '../../lib/moreNavigation';
import { colors } from '../../theme/tokens';
import type { MoreStackParamList } from '../../navigation/types';
import type { MobileFamilyId } from '../../../spec/productMap';
import { listBottomPadding } from '../../lib/layout';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreMain'>;

const MENU_FAMILIES: MobileFamilyId[] = ['life', 'org', 'money', 'insight', 'admin'];

export function MoreScreen({ navigation }: Props) {
  const { roleName, rolePermissions } = useAuth();
  const { theme } = useSchool();
  const families = getVisibleFamilies(roleName, rolePermissions).filter((f) =>
    MENU_FAMILIES.includes(f.id as MobileFamilyId),
  );

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OfflineBanner />

        {families.map((family) => {
          const screens = screensForFamilyVisible(
            family.id as MobileFamilyId,
            roleName,
            rolePermissions,
          );
          if (screens.length === 0) return null;
          return (
            <MenuSection
              key={family.id}
              title={family.label}
              icon={FAMILY_ICONS[family.id as MobileFamilyId]}
              accent={theme.accent}
              accentTint={theme.accentTint}
            >
              {screens.map((s, i) => (
                <MenuRow
                  key={s.id}
                  title={s.label}
                  icon={SCREEN_ICONS[s.id] || 'ellipse-outline'}
                  isLast={i === screens.length - 1}
                  onPress={() => openProductScreen(navigation, s.id, s.label, s.phase)}
                />
              ))}
            </MenuSection>
          );
        })}

        <MenuSection
          title="Compte"
          icon={FAMILY_ICONS.account}
          accent={theme.accent}
          accentTint={theme.accentTint}
        >
          <MenuRow
            title="Version"
            icon="information-circle-outline"
            value={Constants.expoConfig?.version || '1.0.0'}
            isLast
          />
        </MenuSection>
      </ScrollView>
    </Screen>
  );
}

function MenuSection({
  title,
  icon,
  accent,
  accentTint,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  accentTint: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: accentTint }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function MenuRow({
  title,
  icon,
  value,
  isLast,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  value?: string;
  isLast?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.inkSoft} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {value ? (
          <Text style={styles.rowValue} numberOfLines={2}>
            {value}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.border} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, !isLast && styles.rowBorder]}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !isLast && styles.rowBorder, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: listBottomPadding(24),
  },
  section: {
    marginTop: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 52,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.bg,
  },
  rowIcon: {
    width: 28,
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  rowValue: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
