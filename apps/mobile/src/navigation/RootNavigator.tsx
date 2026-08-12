import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AppTabs } from './AppTabs';

export function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme } = useSchool();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <AppTabs />
    </NavigationContainer>
  );
}
