Feature: User Login
  As a user
  I want to log in to my account
  So that I can access my personalized content

  Background:
    Given the user is on the login page

  Scenario: Successful login with valid credentials
    Given the user is on the login page
    When the user enters valid username "testuser" and password "password123"
    And the user clicks the "Login" button
    Then the user should be redirected to the dashboard
    And a welcome message "Welcome, testuser!" should be displayed

  Scenario: Unsuccessful login with invalid password
    Given the user is on the login page
    When the user enters valid username "testuser" and invalid password "wrongpassword"
    And the user clicks the "Login" button
    Then an error message "Invalid username or password" should be displayed
    And the user should remain on the login page