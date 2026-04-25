package com.example.commerce.notification;

import java.time.Instant;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notification")
public class NotificationController {
    private final String serviceName;

    public NotificationController(@Value("${spring.application.name}") String serviceName) {
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
