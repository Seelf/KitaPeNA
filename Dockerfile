FROM dawidkonarczak/greatspn-for-kitapena:latest

# Install system dependencies required for C++ compilation and algorithms
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    clang \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements file to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=5002

# Expose the application port
EXPOSE 5002

# Start the application using the entrypoint script
ENTRYPOINT ["./entrypoint.sh"]
