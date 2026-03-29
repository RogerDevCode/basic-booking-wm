package inner

import (
	"booking-titanium-wm/internal/communication"
)

func main(
	toEmail string,
	subject string,
	body string,
	isHTML bool,
	toName string,
	ccEmails string,
	bccEmails string,
	replyToEmail string,
) (map[string]any, error) {
	req := communication.SendEmailRequest{
		ToEmail:      toEmail,
		ToName:       toName,
		Subject:      subject,
		Body:         body,
		IsHTML:       isHTML,
		CcEmails:     parseEmailList(ccEmails),
		BccEmails:    parseEmailList(bccEmails),
		ReplyToEmail: replyToEmail,
	}

	response := communication.SendEmail(req)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &gmailError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

func parseEmailList(emails string) []string {
	if emails == "" {
		return nil
	}
	result := []string{}
	for _, email := range splitString(emails, ",") {
		trimmed := trimSpace(email)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func splitString(s, sep string) []string {
	result := []string{}
	start := 0
	for i := 0; i <= len(s)-len(sep); i++ {
		if s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}

type gmailError struct {
	message string
}

func (e *gmailError) Error() string {
	return e.message
}
