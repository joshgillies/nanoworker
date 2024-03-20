import nanoworker
import gleeunit
import worker as worker_a
import subdirectory/worker as worker_b
import gleam/javascript/promise.{await}

pub fn main() {
  gleeunit.main()
}

pub type Person {
  Person(name: String, age: Int)
}

pub fn create_worker_test() {
  use worker <- await(nanoworker.create(fn(n) { n + 2 }))
  nanoworker.send(worker, 1)
  |> await(promise.resolve)
  |> promise.tap(fn(value) {
    let assert 3 = value
  })
}

pub fn create_worker_with_custom_type_test() {
  use worker <- await(
    nanoworker.create(fn(person: Person) { Person("Joe", person.age) }),
  )
  nanoworker.send(worker, Person("Joe", 27))
  |> await(promise.resolve)
  |> promise.tap(fn(person: Person) {
    let assert "Joe" = person.name
    let assert 27 = person.age
  })
}

pub fn create_external_worker_test() {
  use worker <- await(nanoworker.create(worker_a.main))

  nanoworker.send(worker, "Module A")
  |> await(promise.resolve)
  |> promise.tap(fn(value) {
    let assert "'MODULE A'" = value
  })
}

pub fn create_external_subdirectory_worker_test() {
  use worker <- await(nanoworker.create(worker_b.main))

  nanoworker.send(worker, "Module B")
  |> await(promise.resolve)
  |> promise.tap(fn(value) {
    let assert "'module b'" = value
  })
}

pub fn worker_message_queue_test() {
  use worker <- await(nanoworker.create(fn(value: Int) { value }))

  let message1 =
    nanoworker.send(worker, 1)
    |> promise.map(fn(value) {
      let assert 1 = value
    })

  let message2 =
    nanoworker.send(worker, 2)
    |> promise.map(fn(value) {
      let assert 2 = value
    })

  promise.await2(message1, message2)
}

pub fn close_worker_test() {
  use worker <- await(nanoworker.create(fn(_) { Nil }))

  nanoworker.send(worker, Nil)
  |> await(promise.resolve)
  |> promise.tap(fn(value) {
    let assert Nil = value
  })

  worker
  |> nanoworker.close
  |> promise.resolve
}
