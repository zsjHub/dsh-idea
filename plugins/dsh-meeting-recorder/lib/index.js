/**
 * dsh-meeting-recorder — host half.
 *
 * Host-side logic: tool registration, system prompt, conversation capture.
 * No HTTP API dependency — the client manages UI state locally.
 *
 * Architecture:
 * - Client half: Web Speech API audio capture, mic button, meeting panel UI
 * - Host half: tool registration, system prompt, conversation capture
 *
 * The tool and system prompt are always active. The user can decide when
 * to use the meeting recorder functionality. No toggle is needed — the AI
 * automatically records and structures the conversation as meeting minutes.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'dsh-meeting-recorder';

export function apply(ctx) {
  const logger = ctx.logger;

  // ── Meeting state ──
  let currentSessionId = null;
  const meetingData = {
    title: '会议纪要',
    date: '',
    content: [],
    topics: [],
    decisions: [],
    actionItems: [],
    summary: ''
  };

  function getText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(function (c) { return c.text || ''; }).filter(Boolean).join('\n');
    }
    return String(content || '');
  }

  // ── System prompt section ──
  ctx.effect(function () {
    const systemPrompt = ctx.get('systemPrompt');
    if (!systemPrompt) {
      logger.warn('[dsh-meeting-recorder] systemPrompt service not available');
      return function () {};
    }
    return systemPrompt.section({
      name: 'meeting-minutes',
      order: 150,
      text: [
        'You are now in **Meeting Minutes Recording Mode**.',
        '',
        'Your role:',
        '- Record and structure the conversation as meeting minutes in real-time',
        '- Help the user clarify and organize their thoughts',
        '- Proactively identify: discussion points, decisions made, and action items',
        '- When the user mentions a decision or action item, confirm and suggest adding it to the minutes',
        '',
        'Available tool:',
        '- Use `add_meeting_content` to add structured content (topics, decisions, action items, summaries)',
        '',
        'Format your responses to be concise and meeting-friendly.'
      ].join('\n')
    });
  });

  // ── Tool registration: add_meeting_content ──
  ctx.effect(function () {
    const tools = ctx.get('tools');
    if (!tools) {
      logger.warn('[dsh-meeting-recorder] tools service not available');
      return function () {};
    }

    const toolDef = defineTool({
      name: 'add_meeting_content',
      description: 'Add structured content to the meeting minutes. Use this to record discussion topics, decisions, action items, and summaries.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['topic', 'decision', 'action_item', 'summary'],
            description: 'Type of content to add: topic (discussion point), decision (agreed conclusion), action_item (task to do), summary (meeting summary)'
          },
          content: {
            type: 'string',
            description: 'The actual text content of the item'
          },
          speaker: {
            type: 'string',
            description: 'Who said/proposed this (optional)'
          },
          owner: {
            type: 'string',
            description: 'Who is responsible (for action items, optional)'
          },
          due_date: {
            type: 'string',
            description: 'Due date (for action items, optional)'
          }
        },
        required: ['type', 'content']
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          },
          additionalProperties: false
        },
        render: function (args, value) {
          return [{ type: 'text', text: '✅ Meeting minutes updated: ' + (value.message || 'OK') }];
        }
      },
      execute: async function (args, exec) {
        if (exec.signal && exec.signal.aborted) throw new Error('Cancelled');
        var input = args;
        var type = input.type;
        var content = input.content;
        var speaker = input.speaker || '';
        var owner = input.owner || '';
        var dueDate = input.due_date || '';

        var item = {
          text: content,
          speaker: speaker,
          timestamp: new Date().toISOString()
        };

        switch (type) {
          case 'topic':
            meetingData.topics.push(item);
            break;
          case 'decision':
            meetingData.decisions.push(item);
            break;
          case 'action_item':
            meetingData.actionItems.push({
              text: content,
              owner: owner,
              dueDate: dueDate,
              timestamp: new Date().toISOString()
            });
            break;
          case 'summary':
            meetingData.summary = content;
            break;
        }

        meetingData.content.push({
          role: 'assistant',
          text: '[系统记录] (' + type + ') ' + content,
          timestamp: new Date().toISOString()
        });

        return { success: true, message: 'Added ' + type + ': ' + content.substring(0, 50) };
      }
    });

    return tools.register(toolDef);
  });

  // ── Capture user messages ──
  ctx.on('agent/inbox/claimed', function (payload) {
    try {
      currentSessionId = payload.agent && payload.agent.session ? payload.agent.session.id : null;
      var text = getText(payload.message && payload.message.content);
      if (text) {
        meetingData.content.push({
          role: 'user',
          text: text,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      logger.error('[dsh-meeting-recorder] Error capturing user message:', e);
    }
  });

  // ── Capture AI messages ──
  ctx.on('session/event', function (session, event) {
    try {
      if (currentSessionId && session.id !== currentSessionId) return;
      if (event.type === 'assistant/message' && event.message) {
        var text = getText(event.message.content);
        if (text) {
          meetingData.content.push({
            role: 'assistant',
            text: text,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      logger.error('[dsh-meeting-recorder] Error capturing assistant message:', e);
    }
  });

  logger.info('[dsh-meeting-recorder] loaded — host half with tool registration, system prompt, and conversation capture');
}