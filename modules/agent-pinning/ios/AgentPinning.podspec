Pod::Spec.new do |s|
  s.name           = 'AgentPinning'
  s.version        = '0.1.0'
  s.summary        = "Pins React Native's WebSocket to the NFC agent's public key"
  s.description    = <<-DESC
    React Native's iOS WebSocket is built on SocketRocket rather than
    NSURLSession, so NSURLSession-based pinning never sees the connection. This
    installs an SRSecurityPolicy that verifies the agent's SubjectPublicKeyInfo
    against the pin issued at pairing.
  DESC
  s.author         = ''
  s.homepage       = 'https://github.com/nedpals/davi-nfc-agent-mobile-app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # The policy and the swizzled initializer are both SocketRocket types, and it
  # is already in the tree as React Native's WebSocket dependency.
  s.dependency 'SocketRocket'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
