# Shared Shopping Lists

This is a web application for creating and managing shared shopping lists.

## Description

The application allows users to create shopping lists, add items to these lists,
mark items as collected, and deactivate lists. It provides a simple interface
for managing multiple shopping lists collaboratively.

## Deployment

The application is deployed at (https://shopping-list-1rvr.onrender.com).

## Running Locally

To run the application locally:

1. Ensure you have Docker and Docker Compose installed on your system.
2. Clone this repository.
3. Navigate to the project directory.
4. Run `docker compose up --build` in your terminal.
5. Once the containers are up and running, access the application at
   `http://localhost:7777`.

Note: Make sure to set up the necessary environment variables in a `project.env`
file before running the application.

## project.env file example
#Database configuration for PostgreSQL (running in container called "database-server")
POSTGRES_USER=username
POSTGRES_PASSWORD=password
POSTGRES_DB=database

#Database configuration for Flyway (used for database migrations)
FLYWAY_USER=username
FLYWAY_PASSWORD=password
FLYWAY_URL=jdbc:postgresql://database-server:5432/database

#Database configuration for PostgreSQL driver
PGUSER=username
PGPASSWORD=password
PGHOST=database-server
PGPORT=5432
PGDATABASE=database

#Deno cache location (avoid reloading depedencies over and over)
DENO_DIR=/app-cache

## To run the tests
1. Ensure you have Docker and Docker Compose installed on your system.
2. Navigate to the test directory.
3. Run `docker compose run --entrypoint=npx e2e-playwright playwright test && docker compose rm -sf` in your terminal.
