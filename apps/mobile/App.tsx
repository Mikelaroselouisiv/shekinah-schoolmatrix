import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SchoolProvider } from './src/context/SchoolContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NetworkProvider>
          <SchoolProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </SchoolProvider>
        </NetworkProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
