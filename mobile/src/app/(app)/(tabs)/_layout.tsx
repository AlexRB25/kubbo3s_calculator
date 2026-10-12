import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable } from 'react-native';

import { type IconName } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useData } from '@/store/data';

const SCREENS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Inicio', icon: 'home' },
  { name: 'productos', title: 'Productos', icon: 'cube' },
  { name: 'filamento', title: 'Filamento', icon: 'color-fill' },
  { name: 'impresiones', title: 'Impresiones', icon: 'print' },
  { name: 'ventas', title: 'Ventas', icon: 'cash' },
];

export default function TabsLayout() {
  const { jobs } = useData();
  const printing = jobs.filter((job) => job.status === 'printing').length;

  return (
    <Tabs
      screenOptions={{
        headerTintColor: Colors.text,
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Más opciones"
            hitSlop={12}
            onPress={() => router.push('/mas')}
            style={{ marginRight: Spacing.three }}>
            <Ionicons name="menu" size={26} color={Colors.text} />
          </Pressable>
        ),
        tabBarStyle: { backgroundColor: Colors.background, borderTopColor: Colors.border },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
      }}>
      {SCREENS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            headerTitle: name === 'index' ? 'Kubbo3D' : title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} size={size} color={color} />,
            tabBarBadge: name === 'impresiones' && printing ? printing : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}
