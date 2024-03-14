import gleam/javascript/promise.{type Promise}

pub type Worker(value) {
  Worker(value)
}

/// Create a new worker
@external(javascript, "./ffi.mjs", "create")
pub fn create(handler: fn(value) -> result) -> Promise(Worker(result))

/// Send a message to the worker
@external(javascript, "./ffi.mjs", "send")
pub fn send(worker: Worker(value), message: value) -> Promise(value)

// TODO: use custom records for messages, and use the type system to ensure that the message is a valid one
// pub fn send(worker: Worker(value), message: value) -> Promise(value) {
//   do_send(worker, message)
// }

/// Close the worker and release its resources
@external(javascript, "./ffi.mjs", "close")
pub fn close(worker: Worker(value)) -> Nil
