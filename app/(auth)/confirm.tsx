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
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { resendSignUpCode } from 'aws-amplify/auth';

export default function ConfirmScreen() {
  const { email, password } = useLocalSearchParams<{ email: string; password: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { confirmSignUpUser, signInUser, signOutUser } = useAuth();

  async function handleConfirm() {
    if (!code) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      console.log('ConfirmScreen: Starting confirmation for email:', email);
      await confirmSignUpUser(email, code);
      console.log('ConfirmScreen: Email confirmed successfully');

      // Auto-login after successful confirmation
      console.log('ConfirmScreen: Attempting auto-login for email:', email, 'password available:', !!password);
      if (!password) {
        console.error('ConfirmScreen: Password not available for auto-login');
        Alert.alert('Success', 'Email verified! Please sign in with your credentials.');
        router.replace('/(auth)/login');
        return;
      }

      // Always sign out before attempting auto-login to ensure clean state
      try {
        console.log('ConfirmScreen: Signing out any existing session...');
        await signOutUser();
        console.log('ConfirmScreen: Sign out successful');
      } catch (signOutError: any) {
        console.log('ConfirmScreen: Sign out attempt completed with:', signOutError?.message || 'no error');
      }

      // Wait a brief moment for sign out to fully complete
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        console.log('ConfirmScreen: Starting sign in...');
        const signInResult = await signInUser(email, password);
        console.log('ConfirmScreen: Auto-login successful, result:', signInResult);
        router.replace('/(tabs)');
      } catch (signInError: any) {
        console.error('ConfirmScreen: Sign in error:', signInError);

        // If still getting "already authenticated" error, force sign out again and redirect to login
        if (signInError.name === 'UserAlreadyAuthenticatedException') {
          console.log('ConfirmScreen: User already authenticated, forcing sign out and redirecting to login');
          try {
            await signOutUser();
          } catch (e) {
            console.log('ConfirmScreen: Force sign out completed');
          }
          Alert.alert('Success', 'Email verified! Please sign in to continue.');
          router.replace('/(auth)/login');
        } else {
          throw signInError;
        }
      }
    } catch (error: any) {
      console.error('ConfirmScreen: Error during confirmation/login:', error);
      console.error('ConfirmScreen: Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      });

      const errorMessage = error.message || error.toString() || 'Failed to verify email';
      Alert.alert('Verification Error', errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setResending(true);
    try {
      await resendSignUpCode({ username: email });
      Alert.alert('Success', 'Verification code resent to your email');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to resend code');
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-8 justify-center">
        {/* Icon Area */}
        <View className="items-center mb-12">
          <View className="w-24 h-24 rounded-full bg-green-100 items-center justify-center mb-6">
            <Text className="text-6xl">📧</Text>
          </View>
          <Text className="text-3xl font-bold text-gray-900 mb-3 text-center">Verify Your Email</Text>
          <Text className="text-base text-gray-600 text-center px-4">
            We sent a verification code to
          </Text>
          <Text className="text-base font-semibold text-blue-500 mt-1">
            {email}
          </Text>
        </View>

        {/* Code Input */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">Verification Code</Text>
          <TextInput
            className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-center text-2xl font-mono tracking-widest focus:border-blue-500"
            placeholder="000000"
            placeholderTextColor="#D1D5DB"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            autoFocus
          />
        </View>

        {/* Verify Button */}
        <TouchableOpacity
          className={`bg-blue-500 py-5 rounded-2xl shadow-lg mb-4 active:opacity-80 ${loading ? 'opacity-60' : ''}`}
          onPress={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-center text-lg font-bold">Verify Email</Text>
          )}
        </TouchableOpacity>

        {/* Resend Code */}
        <TouchableOpacity
          className="py-3 active:opacity-70"
          onPress={handleResendCode}
          disabled={resending || loading}
        >
          {resending ? (
            <ActivityIndicator color="#3B82F6" />
          ) : (
            <Text className="text-center text-base text-gray-600">
              Didn't receive the code?{' '}
              <Text className="font-bold text-blue-500">Resend</Text>
            </Text>
          )}
        </TouchableOpacity>

        {/* Back Button */}
        <TouchableOpacity
          className="mt-4 py-3 active:opacity-70"
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text className="text-center text-sm text-gray-500">
            ← Back to Sign Up
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
