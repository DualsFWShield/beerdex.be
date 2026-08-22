$files = @("data/belgiumbeer.json", "data/frenchbeer.json", "data/newbeer.json", "data/deutchbeer.json", "data/nlbeer.json")
foreach ($f in $files) {
    if (Test-Path $f) {
        $content = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
        $changed = $false
        
        $newContent = @()
        foreach ($b in $content) {
            $keep = $true
            
            # Normalization rules
            
            # Mort Subite -> Alken-Maes
            if ($b.brewery -match "MORT SUBITE" -or $b.brewery -match "ALKEN[- ]MAES") {
                if ($b.brewery -ne "Alken-Maes") {
                    $b.brewery = "Alken-Maes"
                    $changed = $true
                }
            }
            
            # Desperados -> Heineken
            if ($b.brewery -match "Desperados" -or $b.title -match "Desperados") {
                if ($b.brewery -ne "Heineken") {
                    $b.brewery = "Heineken"
                    $changed = $true
                }
                if ($f -ne "data/nlbeer.json") {
                    $keep = $false
                    $changed = $true
                }
            }
            
            # Stella Artois -> AB InBev
            if ($b.title -match "STELLA" -or $b.title -match "Stella Artois") {
                if ($b.title -ne "Stella Artois" -or $b.brewery -ne "AB InBev") {
                    $b.title = "Stella Artois"
                    $b.brewery = "AB InBev"
                    $changed = $true
                }
                
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
                    $changed = $true
                }
            }
            
            # Rochefort
            if ($b.title -match "ROCHEFORT (\d+)" -or $b.title -match "Trappistes Rochefort (\d+)") {
                $num = $matches[1]
                if ($b.title -ne "Rochefort $num Trappistes" -or $b.brewery -ne "Abbaye Notre-Dame de Saint-Remy") {
                    $b.title = "Rochefort $num Trappistes"
                    $b.brewery = "Abbaye Notre-Dame de Saint-Remy"
                    $changed = $true
                }
                
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
                    $changed = $true
                }
            }
            
            # St Bernardus Abt 12
            if ($b.title -match "ST BERNARDUS ABT" -or $b.title -match "St Bernardus Abt 12") {
                if ($b.title -ne "St Bernardus Abt 12" -or $b.brewery -ne "St. Bernardus") {
                    $b.title = "St Bernardus Abt 12"
                    $b.brewery = "St. Bernardus"
                    $changed = $true
                }
                
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
                    $changed = $true
                }
            }
            
            # Corne La Triple 10
            if ($b.title -match "LA CORNE TRIPLE" -or $b.title -match "Corne La Triple 10") {
                if ($b.title -ne "Corne La Triple 10" -or $b.brewery -ne "Ebly") {
                    $b.title = "Corne La Triple 10"
                    $b.brewery = "Ebly"
                    $changed = $true
                }
                
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
                    $changed = $true
                }
            }
            
            # Capitalize common breweries
            if ($b.brewery -match "^AB INBEV") { $b.brewery = "AB InBev"; $changed = $true }
            if ($b.brewery -match "^DU BOCQ") { $b.brewery = "Du Bocq"; $changed = $true }
            if ($b.brewery -match "^LINDEMANS") { $b.brewery = "Lindemans"; $changed = $true }
            if ($b.brewery -match "^DUPONT") { $b.brewery = "Dupont"; $changed = $true }
            
            if ($keep) {
                $newContent += $b
            }
        }
        
        if ($changed) {
            Write-Output "Updating $f"
            # Output raw JSON string instead of standard ConvertTo-Json which wraps arrays
            $newContent | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8
        }
    }
}
