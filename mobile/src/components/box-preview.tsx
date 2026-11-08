import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { BOX_COLORS, boxFaces } from '@/lib/box3d';
import type { BoxMaterial, BoxStyle } from '@/lib/types';

type Box = { length_mm: number; width_mm: number; height_mm: number; style?: BoxStyle; material?: BoxMaterial };

const cm = (mm: number) => `${Math.round(Number(mm)) / 10}`.replace(/\.0$/, '');

/** One still frame of the box, for lists. */
export function BoxThumb({ box, size = 64 }: { box: Box; size?: number }) {
  const colors = BOX_COLORS[box.material ?? 'kraft'] ?? BOX_COLORS.kraft;
  const faces = boxFaces({ length: Number(box.length_mm), width: Number(box.width_mm), height: Number(box.height_mm) }, box.style ?? 'rsc', 0.6, 0.35, size, colors);
  return (
    <Svg width={size} height={size}>
      {faces.map((face, index) => (
        <Polygon key={index} points={face.points} fill={face.fill} stroke={colors.edge} strokeWidth={0.8} strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

/** The box in 3D at its real proportions: it turns by itself and opens or closes with a tap. */
export function BoxPreview({ box, size = 220 }: { box: Box; size?: number }) {
  const [yaw, setYaw] = useState(0.6);
  const [open, setOpen] = useState(0);
  const [opened, setOpened] = useState(false);
  const [spinning, setSpinning] = useState(true);
  const target = useRef(0);

  useEffect(() => {
    target.current = opened ? 1 : 0;
  }, [opened]);

  // Respect "reduce motion": the box stays still until the user asks it to turn.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => reduce && setSpinning(false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let last = Date.now();
    let frame = 0;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (spinning) setYaw((value) => value + dt * 0.7);
      setOpen((value) => {
        const goal = target.current;
        if (Math.abs(goal - value) < 0.01) return goal;
        return value + Math.sign(goal - value) * Math.min(Math.abs(goal - value), dt * 1.8);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning]);

  const colors = BOX_COLORS[box.material ?? 'kraft'] ?? BOX_COLORS.kraft;
  const faces = boxFaces({ length: Number(box.length_mm), width: Number(box.width_mm), height: Number(box.height_mm) }, box.style ?? 'rsc', yaw, open, size, colors);

  return (
    <View style={{ alignItems: 'center', gap: Spacing.two }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Caja de ${cm(box.length_mm)} por ${cm(box.width_mm)} por ${cm(box.height_mm)} centímetros. Toca para ${opened ? 'cerrarla' : 'abrirla'}.`}
        onPress={() => setOpened(!opened)}
        style={{ backgroundColor: Colors.surfaceRaised, borderRadius: Radius.large }}>
        <Svg width={size} height={size}>
          {faces.map((face, index) => (
            <Polygon key={index} points={face.points} fill={face.fill} stroke={colors.edge} strokeWidth={1} strokeLinejoin="round" />
          ))}
        </Svg>
      </Pressable>
      <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>
        {cm(box.length_mm)} × {cm(box.width_mm)} × {cm(box.height_mm)} cm <Text style={{ color: Colors.textSecondary, fontWeight: '400' }}>(largo × ancho × alto)</Text>
      </Text>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        {[
          { label: opened ? 'Cerrar' : 'Abrir', onPress: () => setOpened(!opened) },
          { label: spinning ? 'Detener' : 'Girar', onPress: () => setSpinning(!spinning) },
        ].map((button) => (
          <Pressable
            key={button.label}
            accessibilityRole="button"
            onPress={button.onPress}
            style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one }}>
            <Text style={{ color: Colors.text }}>{button.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
