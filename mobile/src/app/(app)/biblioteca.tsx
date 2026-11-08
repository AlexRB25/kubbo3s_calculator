import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Chips, Empty, ErrorText, Heading, ListItem, Muted, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { COURSE_LEVELS as LEVELS, DOCS } from '@/lib/docs';
import { GUIDES, MATERIALS, type Guide } from '@/lib/guides';
import { supabase } from '@/lib/supabase';
import type { Course } from '@/lib/types';

const CATEGORIES = ['Todas', ...new Set(GUIDES.map((guide) => guide.category))];

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={{ gap: Spacing.one }}>
      <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Text style={{ color: Colors.accent }}>•</Text>
          <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20, flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Text style={{ color: Colors.accent, fontSize: 12, fontWeight: '700' }}>{guide.category}</Text>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700' }}>{guide.title}</Text>
          <Muted>{guide.summary}</Muted>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
      </Pressable>
      {open && (
        <View style={{ gap: Spacing.three, borderTopColor: Colors.border, borderTopWidth: 1, paddingTop: Spacing.three }}>
          <Bullets title="Cuándo hacerla" items={guide.when} />
          <Bullets title="Cómo hacerla" items={guide.steps} />
          <Bullets title="Cómo leer el resultado" items={guide.read} />
          {guide.tip ? (
            <Text style={{ color: Colors.text, backgroundColor: Colors.accentSoft, borderRadius: Radius.small, padding: Spacing.three, overflow: 'hidden' }}>
              💡 {guide.tip}
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

/** Calibration tests and starting values per material. */
type Tab = 'cursos' | 'guias' | 'calibracion' | 'materiales';

/** Courses, guides, calibration tests and starting values per material. */
export default function LearnScreen() {
  const [tab, setTab] = useState<Tab>('cursos');
  const [category, setCategory] = useState('Todas');
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [failure, setFailure] = useState('');
  const shown = category === 'Todas' ? GUIDES : GUIDES.filter((guide) => guide.category === category);

  useEffect(() => {
    let current = true;
    supabase
      .from('courses')
      .select('*, course_lessons(id, minutes)')
      .order('sort')
      .then(({ data, error }) => {
        if (!current) return;
        if (error) setFailure(error.code === '42P01' ? 'Falta actualizar la base de datos (supabase/schema.sql) para ver los cursos.' : error.message);
        else setCourses((data ?? []) as Course[]);
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <Screen>
      <Chips
        options={[
          { value: 'cursos', label: 'Cursos' },
          { value: 'guias', label: 'Guías' },
          { value: 'calibracion', label: 'Calibración' },
          { value: 'materiales', label: 'Materiales' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'cursos' && (
        <>
          <ErrorText>{failure}</ErrorText>
          {!courses && !failure && <Muted>Cargando cursos…</Muted>}
          {courses?.length === 0 && <Empty icon="school" text="Pronto: cursos de parámetros, laminadores, filamentos y diseño para impresión 3D." />}
          {courses?.map((course) => {
            const lessons = course.course_lessons ?? [];
            const minutes = lessons.reduce((total, lesson) => total + lesson.minutes, 0);
            return (
              <ListItem
                key={course.id}
                left={<Ionicons name="school" size={22} color={Colors.accent} />}
                title={course.title}
                subtitle={[LEVELS[course.level], `${lessons.length} lecciones`, minutes ? `${minutes} min` : ''].filter(Boolean).join(' · ')}
                onPress={() => router.push({ pathname: '/aprende/curso', params: { id: course.id } })}
              />
            );
          })}
        </>
      )}

      {tab === 'guias' &&
        DOCS.map((doc) => (
          <ListItem
            key={doc.id}
            left={<Ionicons name="book" size={22} color={Colors.accent} />}
            title={doc.title}
            subtitle={doc.summary}
            onPress={() => router.push({ pathname: '/aprende/guia', params: { id: doc.id } })}
          />
        ))}

      {tab === 'calibracion' && (
        <>
          <Muted>Pruebas de calibración para sacarle la mejor calidad a tu impresora y a cada filamento. Toca una para ver cómo hacerla.</Muted>
          <Chips options={CATEGORIES.map((value) => ({ value, label: value }))} value={category} onChange={setCategory} />
          {shown.map((guide) => (
            <GuideCard key={guide.id} guide={guide} />
          ))}
        </>
      )}

      {tab === 'materiales' && (
        <>
          <Heading>Valores de inicio por material</Heading>
          <Muted>Lo que diga el carrete de tu marca va primero; la torre de temperatura decide.</Muted>
          {MATERIALS.map((item) => (
            <Card key={item.material} style={{ gap: Spacing.two }}>
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700' }}>{item.material}</Text>
              <Muted>
                Boquilla {item.nozzle} · Cama {item.bed} · Ventilador {item.fan}
              </Muted>
              <Muted>Secado: {item.dry}</Muted>
              <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20 }}>{item.notes}</Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
