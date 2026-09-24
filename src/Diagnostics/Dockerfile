FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG VERSION=1.0.0
WORKDIR /src
COPY Directory.Build.props Directory.Packages.props ./
COPY src/Contracts/GeiseIT.LookingGlass.Contracts.csproj src/Contracts/
COPY src/Diagnostics/GeiseIT.LookingGlass.Diagnostics.csproj src/Diagnostics/
RUN dotnet restore src/Diagnostics/GeiseIT.LookingGlass.Diagnostics.csproj
COPY src/Contracts src/Contracts
COPY src/Diagnostics src/Diagnostics
RUN dotnet publish src/Diagnostics/GeiseIT.LookingGlass.Diagnostics.csproj -c Release -o /app --no-restore -p:UseAppHost=false -p:Version=${VERSION}

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS final
RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping traceroute mtr-tiny libcap2-bin \
    && for binary in /usr/bin/ping /usr/bin/mtr-packet /usr/bin/traceroute /usr/bin/mtr; do \
         [ -e "$binary" ] && setcap -r "$binary" 2>/dev/null || true; \
       done \
    && find /usr/bin /usr/sbin /bin /sbin -xdev -perm /6000 -type f -exec chmod a-s {} + \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS="http://+:8080;http://+:9090" \
    DOTNET_EnableDiagnostics=0 \
    DOTNET_TieredPGO=0
EXPOSE 8080 9090
USER 10001:10001
ENTRYPOINT ["dotnet", "GeiseIT.LookingGlass.Diagnostics.dll"]
