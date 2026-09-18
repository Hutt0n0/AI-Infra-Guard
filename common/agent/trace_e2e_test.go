package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestParseRealPythonTraceOutput verifies the exact JSON emitted by
// cli/trace_utils.py + cli/aig_logger.py parses into MessageTraceEvent.
func TestParseRealPythonTraceOutput(t *testing.T) {
	traces := make([]MessageTraceEvent, 0)
	callbacks := TaskCallbacks{
		MessageTraceCallback: func(trace MessageTraceEvent) {
			traces = append(traces, trace)
		},
	}
	config := CmdConfig{}
	tasks := []SubTask{}
	lines := []string{
		`{"type":"messageTrace","content":{"timestamp":"2026-09-18T12:38:27.307593","trace_id":"3fa2d29fcabe4e0c9121a607afc31800","direction":"request","tool":"target_dialogue","stepId":"2","endpoint":"gpt-4o","phase":"attack","attack_method":"Base64","vulnerability":"PII Leakage","turn":1,"payload":"decode this: ...","meta":""}}`,
		`{"type":"messageTrace","content":{"timestamp":"2026-09-18T12:38:27.307764","trace_id":"3fa2d29fcabe4e0c9121a607afc31800","direction":"response","tool":"target_dialogue","stepId":"2","endpoint":"gpt-4o","phase":"attack","attack_method":"Base64","vulnerability":"PII Leakage","turn":1,"payload":"refused","meta":"{\"elapsed_ms\": 0}"}}`,
	}
	for _, line := range lines {
		ParseStdoutLine("", "", tasks, line, callbacks, &config, false)
	}
	assert.Len(t, traces, 2)
	assert.Equal(t, "request", traces[0].Direction)
	assert.Equal(t, "3fa2d29fcabe4e0c9121a607afc31800", traces[0].TraceId)
	assert.Equal(t, "Base64", traces[0].AttackMethod)
	assert.Equal(t, "PII Leakage", traces[0].Vulnerability)
	assert.Equal(t, "decode this: ...", traces[0].Payload)
	assert.Equal(t, "response", traces[1].Direction)
	assert.Equal(t, "refused", traces[1].Payload)
	assert.Contains(t, traces[1].Meta, "elapsed_ms")
}
