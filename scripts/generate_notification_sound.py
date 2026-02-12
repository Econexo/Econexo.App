#!/usr/bin/env python3
"""
Generate a simple notification sound using only standard library
"""
import wave
import math
import struct

# Parameters
sample_rate = 22050  # Lower sample rate for smaller file
duration = 0.3  # seconds
num_samples = int(sample_rate * duration)

# Generate two-tone chime (C5 and E5)
freq1 = 523.25  # C5
freq2 = 659.25  # E5

audio_data = []
for i in range(num_samples):
    t = i / sample_rate
    # Envelope (fade out)
    envelope = math.exp(-5 * t / duration)
    # Two tones
    sample = (math.sin(2 * math.pi * freq1 * t) + 
              0.7 * math.sin(2 * math.pi * freq2 * t)) / 2
    sample *= envelope
    # Convert to 16-bit integer
    audio_data.append(int(sample * 32767))

# Write to WAV file
output_file = '../public/notification-sound.wav'
with wave.open(output_file, 'w') as wav_file:
    wav_file.setnchannels(1)  # Mono
    wav_file.setsampwidth(2)  # 16-bit
    wav_file.setframerate(sample_rate)
    for sample in audio_data:
        wav_file.writeframes(struct.pack('<h', sample))

print(f"Notification sound created: {output_file}")
