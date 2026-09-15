import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider } from './src/context/AuthContext';
import { SchoolProvider } from './src/context/SchoolContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AndroidUpdatePrompt } from './src/components/AndroidUpdatePrompt';
import { TeacherBirthdayReminders } from './src/components/TeacherBirthdayReminders';
import { TeacherMorningDutyReminders } from './src/components/TeacherMorningDutyReminders';

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AuthProvider>
          <NetworkProvider>
            <SchoolProvider>
              <View style={{ flex: 1 }}>
                <StatusBar style="dark" />
                <RootNavigator />
                <TeacherBirthdayReminders />
                <TeacherMorningDutyReminders />
                <AndroidUpdatePrompt />
              </View>
            </SchoolProvider>
          </NetworkProvider>
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
