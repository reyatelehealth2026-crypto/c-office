// POST /hooks/event — receives JSON bodies from Claude Code hooks (post-event.sh).
// Body shape mirrors Claude's hook payload; we normalize to internal events/tasks.
import { upsertSession, endSession, pushEvent, startTask, finishTask } from '../state.js';

const SUMM = (s, n=90) => {
  if (typeof s !== 'string') s = JSON.stringify(s ?? '');
  s = s.replace(/\s+/g,' ').trim();
  return s.length > n ? s.slice(0, n-1) + '…' : s;
};

export default function hooksRoute(req, res) {
  const eventName = req.get('X-COffice-Event') || req.body?.hook_event_name || 'unknown';
  const body = req.body || {};
  const sessionId = body.session_id || body.sessionId;
  const ts = body.timestamp ? Date.parse(body.timestamp) || Date.now() : Date.now();

  try {
    switch (eventName) {
      case 'SessionStart':
        upsertSession({
          sessionId,
          pid: body.pid || process.pid,
          cwd: body.cwd,
          startedAt: ts,
          kind: body.session_kind || 'interactive',
          subagent_type: body.subagent_type,
        });
        break;

      case 'SessionEnd':
        if (sessionId) endSession(sessionId, 'session-end');
        break;

      case 'Stop':
        // Stop = assistant turn ended, NOT session end. Just log it as a marker.
        pushEvent({
          ts, sessionId,
          verb: 'turn-end',
          text: '— turn complete',
          status: 'ok',
          dedupeKey: `stop:${sessionId}:${ts}`,
        });
        break;

      case 'UserPromptSubmit':
        pushEvent({
          ts, sessionId,
          verb: 'prompt',
          text: SUMM(body.prompt || body.user_prompt || ''),
          status: 'ok',
          dedupeKey: `prompt:hook:${sessionId}:${ts}`,
        });
        break;

      case 'PreToolUse':
        pushEvent({
          ts, sessionId,
          verb: 'used',
          toolName: body.tool_name,
          text: SUMM(body.tool_input?.command || body.tool_input?.file_path || body.tool_input?.description || body.tool_name),
          status: 'ok',
          toolUseId: body.tool_use_id,
          dedupeKey: `tu:${body.tool_use_id || `${sessionId}:${ts}`}`,
        });
        if (body.tool_name === 'Task' || body.tool_name === 'Agent') {
          startTask({
            tool_use_id: body.tool_use_id,
            sessionId,
            subagent_type: body.tool_input?.subagent_type,
            description: body.tool_input?.description || body.tool_input?.prompt?.slice(0, 140),
          });
        }
        break;

      case 'PostToolUse':
        pushEvent({
          ts, sessionId,
          verb: 'result',
          toolName: body.tool_name,
          text: SUMM(body.tool_response?.output || body.tool_result || ''),
          status: body.tool_response?.is_error ? 'err' : 'ok',
          toolUseId: body.tool_use_id,
          dedupeKey: `tr:${body.tool_use_id || `${sessionId}:${ts}`}`,
        });
        if (body.tool_name === 'Task' || body.tool_name === 'Agent') {
          finishTask({ tool_use_id: body.tool_use_id, status: body.tool_response?.is_error ? 'failed' : 'done' });
        }
        break;

      case 'SubagentStart':
        upsertSession({
          sessionId: body.subagent_session_id || body.session_id,
          pid: body.pid || 0,
          cwd: body.cwd,
          startedAt: ts,
          kind: 'agent',
          subagent_type: body.subagent_type || body.agent_type,
          parentSessionId: body.parent_session_id,
        });
        break;

      case 'SubagentStop':
        if (body.subagent_session_id) endSession(body.subagent_session_id, 'subagent-stop');
        break;

      default:
        pushEvent({
          ts, sessionId,
          verb: eventName.toLowerCase(),
          text: SUMM(JSON.stringify(body)),
          status: 'ok',
          dedupeKey: `hook:${eventName}:${ts}`,
        });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
