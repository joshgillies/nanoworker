import gleam/string

fn do_quote(quote) {
  "'" <> quote <> "'"
}

pub fn main(quote) {
  do_quote(quote)
  |> string.lowercase
}
