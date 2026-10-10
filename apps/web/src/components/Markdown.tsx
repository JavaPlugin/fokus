// Rechtstexte als Markdown (Parser: packages/core/src/markdown.ts). Alles wird als Text
// dargestellt, nie als HTML; Links nur http(s)/mailto, mit rel="noopener noreferrer".
import { parseMarkdown, type Inline } from '@fokus/core';
import { font, type, usePalette } from '@fokus/ui';
import { Text, View } from 'react-native';

export function Markdown({ source }: { source: string }) {
  const p = usePalette();
  const inline = (xs: Inline[]) =>
    xs.map((x, i) =>
      x.t === 'bold' ? (
        <Text key={i} style={{ fontFamily: font.semibold }}>
          {x.v}
        </Text>
      ) : x.t === 'fill' ? (
        <Text key={i} style={{ color: p.warning, fontStyle: 'italic' }}>
          [Betreiber: {x.v}]
        </Text>
      ) : x.t === 'link' ? (
        <Text
          key={i}
          accessibilityRole="link"
          // react-native-web: echtes <a href> mit festen Attributen
          {...({
            href: x.href,
            hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' },
          } as object)}
          style={{ color: p.ink, textDecorationLine: 'underline' }}
        >
          {x.v}
        </Text>
      ) : (
        x.v
      ),
    );
  return (
    <View style={{ gap: 12 }}>
      {parseMarkdown(source).map((b, i) =>
        b.type === 'h' ? (
          <Text
            key={i}
            accessibilityRole="header"
            style={[
              b.level === 1 ? type.title : type.section,
              { color: p.ink, marginTop: i ? 12 : 0 },
              b.level === 3 && { fontSize: 17 },
            ]}
          >
            {inline(b.text)}
          </Text>
        ) : b.type === 'p' ? (
          <Text key={i} style={[type.body, { color: p.ink, lineHeight: 24 }]}>
            {inline(b.text)}
          </Text>
        ) : (
          <View key={i} style={{ gap: 6 }}>
            {b.items.map((it, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={[type.body, { color: p.ink3 }]}>•</Text>
                <Text style={[type.body, { flex: 1, color: p.ink, lineHeight: 24 }]}>
                  {inline(it)}
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}
