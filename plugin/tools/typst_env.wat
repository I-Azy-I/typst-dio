;; Stand-in for Typst's plugin host imports while Wizer pre-initialises the
;; module (the init function never calls them).
(module
  (func (export "wasm_minimal_protocol_send_result_to_host") (param i32 i32))
  (func (export "wasm_minimal_protocol_write_args_to_buffer") (param i32)))
