import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Text,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInUser } = useAuth();

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signInUser(email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gradient-to-b from-blue-50 to-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-8 justify-center">
        {/* Logo/Icon Area */}
        <View className="items-center mb-12">
          <View className="w-20 h-20 rounded-full bg-blue-500 items-center justify-center shadow-lg mb-4">
            <Text className="text-white text-4xl font-bold">💬</Text>
          </View>
          <Text className="text-4xl font-bold text-gray-900 mb-2">Welcome Back</Text>
          <Text className="text-base text-gray-500">Sign in to continue chatting</Text>
        </View>

        {/* Input Fields */}
        <View className="gap-4 mb-6">
          <View>
            <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">Email</Text>
            <TextInput
              className="bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 text-base focus:border-blue-500"
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>
          <View>
            <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">Password</Text>
            <TextInput
              className="bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 text-base focus:border-blue-500"
              placeholder="Enter your password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>
        </View>

        {/* Sign In Button */}
        <TouchableOpacity
          className={`bg-blue-500 py-5 rounded-2xl shadow-lg mb-6 active:opacity-80 ${loading ? 'opacity-60' : ''}`}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-center text-lg font-bold">Sign In</Text>
          )}
        </TouchableOpacity>

        {/* Sign Up Link */}
        <TouchableOpacity
          className="active:opacity-70"
          onPress={() => router.push('/(auth)/signup')}
          disabled={loading}
        >
          <Text className="text-center text-base text-gray-600">
            Don't have an account?{' '}
            <Text className="font-bold text-blue-500">Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
