import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NowPlayingScreen } from './src/screens/NowPlayingScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <NowPlayingScreen />
    </SafeAreaProvider>
  );
}