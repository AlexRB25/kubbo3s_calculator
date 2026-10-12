import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { imageUrl } from '@/lib/supabase';

/** Square product photo; a plain tile while the product has none. */
export function ProductThumb({ path, size = 48 }: { path: string | null; size?: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      {path && <Image source={imageUrl(path)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: Radius.small, backgroundColor: Colors.surfaceRaised, overflow: 'hidden' },
});
