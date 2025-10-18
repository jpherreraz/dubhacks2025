const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for AWS Amplify
config.resolver.sourceExts.push('cjs');

module.exports = config;
