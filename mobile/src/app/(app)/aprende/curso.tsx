import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, ErrorText, Loading, Muted, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { COURSE_LEVELS, youtubeId } from '@/lib/docs';
import { supabase } from '@/lib/supabase';
import type { Course, CourseLesson } from '@/lib/types';

/** Opens a video or link inside the app (in-app browser), not in another app. */
const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

function Lesson({ lesson, index }: { lesson: CourseLesson; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);
  const video = youtubeId(lesson.video_url);
  const kind = lesson.kind === 'video' ? 'Video' : lesson.kind === 'article' ? 'Lectura' : 'Enlace';
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', gap: Spacing.two }}>
        <Text style={{ color: Colors.textSecondary, width: 22 }}>{index + 1}.</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{lesson.title}</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
            {kind}
            {lesson.minutes ? ` · ${lesson.minutes} min` : ''}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
      </Pressable>
      {expanded && (
        <View style={{ gap: Spacing.three }}>
          {lesson.kind === 'video' && lesson.video_url ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Ver el video ${lesson.title}`} onPress={() => open(lesson.video_url!)}>
              {video ? (
                <View style={{ borderRadius: Radius.medium, overflow: 'hidden', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
                  <Image source={{ uri: `https://img.youtube.com/vi/${video}/hqdefault.jpg` }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="play-circle" size={64} color="#FFFFFF" />
                  </View>
                </View>
              ) : (
                <Button icon="play" label="Ver el video" onPress={() => open(lesson.video_url!)} />
              )}
            </Pressable>
          ) : null}
          {lesson.body
            .split(/\n{2,}/)
            .filter((paragraph) => paragraph.trim())
            .map((paragraph, at) => (
              <Text key={at} style={{ color: Colors.text, fontSize: 15, lineHeight: 22 }}>
                {paragraph}
              </Text>
            ))}
          {lesson.link_url ? <Button variant="secondary" icon="open" label="Abrir el enlace" onPress={() => open(lesson.link_url!)} /> : null}
        </View>
      )}
    </Card>
  );
}

/** A course and its lessons. */
export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let current = true;
    supabase
      .from('courses')
      .select('*, course_lessons(*)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!current) return;
        if (error) setFailure(error.message);
        setCourse(data ? { ...(data as Course), course_lessons: [...((data as Course).course_lessons ?? [])].sort((a, b) => a.sort - b.sort) } : null);
      });
    return () => {
      current = false;
    };
  }, [id]);

  if (course === undefined && !failure) return <Loading />;
  if (!course) return <Empty icon="school" text={failure || 'Este curso ya no está disponible.'} />;
  const lessons = course.course_lessons ?? [];
  return (
    <Screen>
      <Stack.Screen options={{ title: course.title }} />
      {course.cover_url ? <Image source={{ uri: course.cover_url }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.medium }} contentFit="cover" /> : null}
      <Text style={{ color: Colors.accent, fontWeight: '700' }}>{COURSE_LEVELS[course.level]}</Text>
      {course.summary ? <Muted>{course.summary}</Muted> : null}
      <ErrorText>{failure}</ErrorText>
      {lessons.length === 0 && <Muted>Este curso todavía no tiene lecciones.</Muted>}
      {lessons.map((lesson, index) => (
        <Lesson key={lesson.id} lesson={lesson} index={index} />
      ))}
    </Screen>
  );
}
