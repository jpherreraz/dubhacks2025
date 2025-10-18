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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUpUser } = useAuth();

  async function handleSignUp() {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters with uppercase, lowercase, number, and symbol');
      return;
    }

    setLoading(true);
    try {
      await signUpUser(email, password);
      router.push({
        pathname: '/(auth)/confirm',
        params: { email, password }
      });
    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Failed to sign up';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-8 justify-center py-12">
          {/* Logo/Icon Area */}
          <View className="items-center mb-10">
            <View className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 items-center justify-center shadow-lg mb-4">
              <Text className="text-white text-4xl font-bold">✨</Text>
            </View>
            <Text className="text-4xl font-bold text-gray-900 mb-2">Create Account</Text>
            <Text className="text-base text-gray-500">Sign up to start chatting</Text>
          </View>

          {/* Input Fields */}
          <View className="gap-4 mb-6">
            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">Email</Text>
              <TextInput
                className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base focus:border-blue-500"
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
                className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base focus:border-blue-500"
                placeholder="Minimum 8 characters"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
              />
            </View>
            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">Confirm Password</Text>
              <TextInput
                className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base focus:border-blue-500"
                placeholder="Re-enter your password"
                placeholderTextColor="#9CA3AF"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!loading}
              />
            </View>
          </View>

          {/* Password Requirements */}
          <View className="bg-blue-50 rounded-xl p-4 mb-6">
            <Text className="text-xs text-gray-600 mb-1">Password must include:</Text>
            <Text className="text-xs text-gray-600">• At least 8 characters</Text>
            <Text className="text-xs text-gray-600">• Uppercase and lowercase letters</Text>
            <Text className="text-xs text-gray-600">• Numbers and special characters</Text>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity
            className={`bg-blue-500 py-5 rounded-2xl shadow-lg mb-6 active:opacity-80 ${loading ? 'opacity-60' : ''}`}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-center text-lg font-bold">Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Sign In Link */}
          <TouchableOpacity
            className="active:opacity-70"
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text className="text-center text-base text-gray-600">
              Already have an account?{' '}
              <Text className="font-bold text-blue-500">Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
