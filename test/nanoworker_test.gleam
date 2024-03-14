import nanoworker
import gleeunit
import worker
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
  use worker <- await(nanoworker.create(worker.main))

  nanoworker.send(worker, "test")
  |> await(promise.resolve)
  |> promise.tap(fn(value) {
    let assert "'TEST'" = value
  })
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
