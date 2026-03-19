// Updated main.go

func procedureHandler(req Request) {
    // other existing code...
    if req.IsFunction {
        for _, p := range req.Params {
            if p.Type == "date" || strings.Contains(strings.ToLower(p.Name), "fecha") || strings.Contains(strings.ToLower(p.Name), "periodo") {
                if err := parseDateParam(p); err != nil {
                    http.Error(w, "Invalid date format", http.StatusBadRequest)
                    return
                }
                args = append(args, parsedTime)
            }
        }
    }
    // other existing code...
}

func asyncProcedureHandler(req Request) {
    // other existing code...
    if req.IsFunction {
        for _, p := range req.Params {
            if p.Type == "date" || strings.Contains(strings.ToLower(p.Name), "fecha") || strings.Contains(strings.ToLower(p.Name), "periodo") {
                if err := parseDateParam(p); err != nil {
                    // handle error
                    return
                }
                asyncArgs = append(asyncArgs, parsedTime)
            }
        }
    }
    // other existing code...
}

func parseDateParam(param Param) (time.Time, error) {
    var t time.Time
    layouts := []string{"2006-01-02", "02/01/2006"}
    for _, layout := range layouts {
        if parsedTime, err := time.Parse(layout, param.Value); err == nil {
            return parsedTime, nil
        }
    }
    return t, fmt.Errorf("unable to parse date")
}

func setupLogFileName(instanceName string, port string) string {
    timestamp := time.Now().Format("2006-01-02_15-04-05")
    instName := instanceName
    if instanceName == "auto" {
        instName = "inst-auto"
    }
    return fmt.Sprintf("log/go-oracle-api__inst-%s__port-%s__%s.log", instName, port, timestamp)
}