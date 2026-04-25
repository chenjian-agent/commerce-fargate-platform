package com.example.commerce.auth;

import java.time.Instant;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final String serviceName;

    public AuthController(@Value("${spring.application.name}") String serviceName) {
        this.serviceName = serviceName;
    }

    @GetMapping
    public Map<String, Object> index() {
        return Map.of(
            "service", serviceName,
            "status", "ok",
            "timestamp", Instant.now().toString()
        );
    }
}
