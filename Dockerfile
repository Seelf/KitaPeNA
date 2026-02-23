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

# Initialize admin user then run the app using Gunicorn binding to all interfaces
CMD python init_admin.py && gunicorn --bind 0.0.0.0:5002 --workers 2 --timeout 120 web_app.app:app
