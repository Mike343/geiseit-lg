FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG VERSION=1.0.0
WORKDIR /src
COPY Directory.Build.props Directory.Packages.props ./
COPY src/Contracts/GeiseIT.LookingGlass.Contracts.csproj src/Contracts/
COPY src/Api/GeiseIT.LookingGlass.Api.csproj src/Api/
RUN dotnet restore src/Api/GeiseIT.LookingGlass.Api.csproj
COPY src/Contracts src/Contracts
COPY src/Api src/Api
RUN dotnet publish src/Api/GeiseIT.LookingGlass.Api.csproj -c Release -o /app --no-restore -p:UseAppHost=false -p:Version=${VERSION}

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS="http://+:8080;http://+:9090" \
    DOTNET_EnableDiagnostics=0 \
    DOTNET_TieredPGO=0
EXPOSE 8080 9090
USER 10001:10001
ENTRYPOINT ["dotnet", "GeiseIT.LookingGlass.Api.dll"]
