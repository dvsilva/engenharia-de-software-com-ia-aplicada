package main

import (
	"cmp"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"notas-api/internal/factories"
)

func main() {
	port := cmp.Or(os.Getenv("PORT"), "3000")
	httpHandler := factories.NewTaskApp(nil).HTTPHandler

	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("HTTP server listening on http://localhost:%s\n", port)
	log.Fatal(http.Serve(listener, httpHandler))
}
