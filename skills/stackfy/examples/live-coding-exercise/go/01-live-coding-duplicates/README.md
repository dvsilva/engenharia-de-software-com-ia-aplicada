# live-coding-duplicates

The live coding warm-up in **Go**: a starting point to fill in, the reference solution, which returns the numbers that appear more than once in order of first appearance, and the tests that run against either one.

## Requirements

- **Go** 1.27 or later

## Testing

```bash
go test ./test/                   # tests your code in src/
go run ./scripts/verify-solution  # tests the reference solution
```

## Running

```bash
go run ./cmd/duplicates '[1,2,2,3,3,3]'
```

`cmd/duplicates` is the driver the cases run: it takes the list as a JSON array and prints the solution's answer as one line of JSON.

The tests take the solution when `SOLUTION` is set, as the original's do, and read it inside the test, because **Go**'s test cache ignores a variable read while the package initializes and would replay one run's result for the other. They compare with reflect.DeepEqual, which tells a nil slice from an empty one as assert.deepEqual tells undefined from an empty array, so the starting point fails all five tests and the solution answers an empty slice, which encoding/json writes as `[]` instead of `null`. A **Go** map iterates in random order, so the solution keeps each number's first appearance in a slice beside the counts.
