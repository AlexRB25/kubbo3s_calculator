import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Card, Empty, Heading, Muted, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { DOCS, type DocBlock } from '@/lib/docs';

/** A table on a phone: each row becomes a small card, its first cell as the title. */
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <View style={{ gap: Spacing.two }}>
      {rows.map((row) => (
        <View key={row.join('|')} style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.small, padding: Spacing.two, gap: Spacing.one }}>
          <Text style={{ color: Colors.text, fontWeight: '700' }}>{row[0]}</Text>
          {row.slice(1).map((cell, index) => (
            <Text key={index} style={{ color: Colors.text, fontSize: 13, lineHeight: 18 }}>
              <Text style={{ color: Colors.textSecondary }}>{head[index + 1]}: </Text>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Block({ block }: { block: DocBlock }) {
  if (block.type === 'p') return <Text style={{ color: Colors.text, fontSize: 15, lineHeight: 22 }}>{block.text}</Text>;
  if (block.type === 'tip')
    return (
      <Text style={{ color: Colors.text, backgroundColor: Colors.accentSoft, borderRadius: Radius.small, padding: Spacing.three, overflow: 'hidden', lineHeight: 20 }}>
        💡 {block.text}
      </Text>
    );
  if (block.type === 'list')
    return (
      <View style={{ gap: Spacing.one }}>
        {block.items.map((item) => (
          <View key={item} style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Text style={{ color: Colors.accent }}>•</Text>
            <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20, flex: 1 }}>{item}</Text>
          </View>
        ))}
      </View>
    );
  return <Table head={block.head} rows={block.rows} />;
}

/** One of Kubbo3D's printing guides. */
export default function GuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = DOCS.find((item) => item.id === id);
  if (!doc) return <Empty icon="book" text="No encontramos esta guía." />;
  return (
    <Screen>
      <Stack.Screen options={{ title: doc.title }} />
      <Muted>{doc.summary}</Muted>
      {doc.sections.map((section) => (
        <Card key={section.title}>
          <Heading>{section.title}</Heading>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
