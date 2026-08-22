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
            if ($b.brewery -match "Desperados" -or $b.name -match "Desperados") {
                if ($b.brewery -ne "Heineken") {
                    $b.brewery = "Heineken"
                    $changed = $true
                }
                # User says "Tout doit être dans nlbeer". If we are not in nlbeer, we should delete Desperados?
                if ($f -ne "data/nlbeer.json") {
                    $keep = $false
                    $changed = $true
                }
            }
            
            # Stella Artois -> AB InBev
            if ($b.name -match "STELLA" -or $b.name -match "Stella Artois") {
                $b.name = "Stella Artois"
                $b.brewery = "AB InBev"
                $changed = $true
                
                # Deduplicate: only keep in belgiumbeer (Wait, user said "Met bien Stella Artois dcp", meaning we change the name to Stella Artois. Let's keep it in belgiumbeer.json and delete from newbeer.json)
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
                }
            }
            
            # Rochefort
            if ($b.name -match "ROCHEFORT (\d+)" -or $b.name -match "Trappistes Rochefort (\d+)") {
                $num = $matches[1]
                $b.name = "Rochefort $num Trappistes"
                $b.brewery = "Abbaye Notre-Dame de Saint-Remy"
                $changed = $true
                
                # Deduplicate: delete from newbeer.json
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
                }
            }
            
            # St Bernardus Abt 12
            if ($b.name -match "ST BERNARDUS ABT" -or $b.name -match "St Bernardus Abt 12") {
                $b.name = "St Bernardus Abt 12"
                $b.brewery = "St. Bernardus"
                $changed = $true
                
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
                }
            }
            
            # Corne La Triple 10
            if ($b.name -match "LA CORNE TRIPLE" -or $b.name -match "Corne La Triple 10") {
                $b.name = "Corne La Triple 10"
                $b.brewery = "Ebly"
                $changed = $true
                
                if ($f -eq "data/newbeer.json") {
                    $keep = $false
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
            $newContent | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8
        }
    }
}
