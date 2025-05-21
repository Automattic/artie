import { Box, Text } from 'ink';
import React, { type ReactElement, type ReactNode, useState, useEffect } from 'react';

interface SimpleMarkdownProps {
  children: ReactNode;
}

type LineType = 'normal' | 'h1' | 'h2' | 'h3' | 'thinking';

interface TextSegment {
  content: string;
  isBold: boolean;
  isCode: boolean;
  isThinking: boolean;
}

interface ProcessedLine {
  type: LineType;
  segments: TextSegment[];
  isThinking: boolean;
}

const SimpleMarkdown = ({ children }: SimpleMarkdownProps): ReactElement | null => {
  const [processedLines, setProcessedLines] = useState<ProcessedLine[]>([]);

  useEffect(() => {
    if (!children) return;
    const content = String(children);

    // Process content to handle think tags in real-time
    let currentIndex = 0;
    let isInThinkingMode = false;
    const newLines: ProcessedLine[] = [];
    let currentLineContent = '';

    const processCurrentLine = (line: string, isThinking: boolean) => {
      // Always process the line, even if empty, to preserve paragraph breaks
      const trimmedLine = line.trim();
      let type: LineType = isThinking ? 'thinking' : 'normal';
      let segments: TextSegment[] = [];

      // Handle headings
      if (trimmedLine.startsWith('# ')) {
        type = 'h1';
        segments = [
          { content: trimmedLine.substring(2), isBold: false, isCode: false, isThinking },
        ];
      } else if (trimmedLine.startsWith('## ')) {
        type = 'h2';
        segments = [
          { content: trimmedLine.substring(3), isBold: false, isCode: false, isThinking },
        ];
      } else if (trimmedLine.startsWith('### ')) {
        type = 'h3';
        segments = [
          { content: trimmedLine.substring(4), isBold: false, isCode: false, isThinking },
        ];
      } else {
        // If line is empty, create an empty segment
        if (!trimmedLine) {
          segments = [{ content: '', isBold: false, isCode: false, isThinking }];
        } else {
          // Process bold and inline code
          let currentText = '';
          let i = 0;

          while (i < line.length) {
            if (i + 1 < line.length && line.substring(i, i + 2) === '**') {
              if (currentText) {
                segments.push({ content: currentText, isBold: false, isCode: false, isThinking });
                currentText = '';
              }

              i += 2;
              let boldText = '';
              let foundClosingMarker = false;

              while (i < line.length) {
                if (i + 1 < line.length && line.substring(i, i + 2) === '**') {
                  foundClosingMarker = true;
                  break;
                }
                boldText += line[i];
                i++;
              }

              if (foundClosingMarker) {
                if (boldText) {
                  segments.push({ content: boldText, isBold: true, isCode: false, isThinking });
                }
                i += 2;
              } else {
                segments.push({
                  content: `**${boldText}`,
                  isBold: false,
                  isCode: false,
                  isThinking,
                });
              }
            } else if (line[i] === '`') {
              if (currentText) {
                segments.push({ content: currentText, isBold: false, isCode: false, isThinking });
                currentText = '';
              }

              i++;
              let codeText = '';
              let foundClosingTick = false;

              while (i < line.length) {
                if (line[i] === '`') {
                  foundClosingTick = true;
                  break;
                }
                codeText += line[i];
                i++;
              }

              if (foundClosingTick) {
                segments.push({ content: codeText, isBold: false, isCode: true, isThinking });
                i++;
              } else {
                segments.push({
                  content: `\`${codeText}`,
                  isBold: false,
                  isCode: false,
                  isThinking,
                });
              }
            } else {
              currentText += line[i];
              i++;
            }
          }

          if (currentText) {
            segments.push({ content: currentText, isBold: false, isCode: false, isThinking });
          }
        }
      }

      newLines.push({ type, segments, isThinking });
    };

    while (currentIndex < content.length) {
      const thinkStart = content.indexOf('<think>', currentIndex);
      const thinkEnd = content.indexOf('</think>', currentIndex);

      if (thinkStart !== -1 && (thinkEnd === -1 || thinkStart < thinkEnd)) {
        // Process content before think tag
        const beforeThink = content.substring(currentIndex, thinkStart);
        beforeThink.split('\n').forEach((line) => processCurrentLine(line, false));

        isInThinkingMode = true;
        currentIndex = thinkStart + 7; // Length of <think>
      } else if (thinkEnd !== -1) {
        // Process content before think end tag
        const duringThink = content.substring(currentIndex, thinkEnd);
        // Process each line separately to preserve line breaks
        duringThink.split('\n').forEach((line) => processCurrentLine(line, true));

        isInThinkingMode = false;
        currentIndex = thinkEnd + 8; // Length of </think>
      } else {
        // Process remaining content
        const remaining = content.substring(currentIndex);
        remaining.split('\n').forEach((line) => processCurrentLine(line, isInThinkingMode));
        break;
      }
    }

    setProcessedLines(newLines);
  }, [children]);

  if (!processedLines.length) return null;

  return (
    <Box flexDirection="column">
      {processedLines.map((line, i) => {
        // Group thinking lines together
        if (line.isThinking) {
          // Start of a thinking section
          if (i === 0 || !processedLines[i - 1]?.isThinking) {
            // Find all consecutive thinking lines
            const thinkingLines = [line];
            let nextIndex = i + 1;
            while (nextIndex < processedLines.length && processedLines[nextIndex].isThinking) {
              thinkingLines.push(processedLines[nextIndex]);
              nextIndex++;
            }

            return (
              <Box
                key={i}
                flexDirection="column"
                marginTop={0}
                marginLeft={0}
                marginBottom={0}
                paddingRight={5}
                paddingLeft={1}
                borderLeftColor="gray"
                borderStyle="single"
                borderTop={false}
                borderBottom={false}
                borderRight={false}
              >
                <Box>
                  <Text bold dimColor>
                    Thinking...
                  </Text>
                </Box>
                {thinkingLines.map((thinkLine, thinkIndex) => (
                  <Box key={`think-${thinkIndex}`} flexDirection="column">
                    {thinkLine.segments.length === 0 ||
                    (thinkLine.segments.length === 1 && !thinkLine.segments[0].content) ? (
                      // Only add height if it's not the last line
                      thinkIndex < thinkingLines.length - 1 ? (
                        <Box height={1} />
                      ) : null
                    ) : (
                      <Text dimColor>
                        {thinkLine.segments.map((segment, j) => {
                          if (segment.isBold) {
                            return (
                              <Text key={j} bold>
                                {segment.content}
                              </Text>
                            );
                          }
                          if (segment.isCode) {
                            return (
                              <Text key={j} color="yellow">
                                {segment.content}
                              </Text>
                            );
                          }
                          return segment.content;
                        })}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            );
          }
          // Skip thinking lines that were already rendered
          return null;
        }

        // Handle non-thinking lines
        if (
          line.segments.length === 0 ||
          (line.segments.length === 1 && !line.segments[0].content)
        ) {
          return <Box key={i} height={1} />;
        }

        return (
          <Box key={i} flexDirection="column">
            {i > 0 && processedLines[i - 1]?.isThinking && <Box height={1} />}
            {line.type !== 'normal' && line.type !== 'thinking' ? (
              <Box>
                <Text bold color="cyan">
                  {line.segments.map((segment) => segment.content).join('')}
                </Text>
              </Box>
            ) : (
              <Box>
                <Text>
                  {line.segments.map((segment, j) => {
                    if (segment.isBold) {
                      return (
                        <Text key={j} bold>
                          {segment.content}
                        </Text>
                      );
                    }
                    if (segment.isCode) {
                      return (
                        <Text key={j} color="yellow">
                          {segment.content}
                        </Text>
                      );
                    }
                    return segment.content;
                  })}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default SimpleMarkdown;
